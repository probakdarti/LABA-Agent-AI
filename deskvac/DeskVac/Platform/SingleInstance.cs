using System.IO.Pipes;
using System.Text;

namespace DeskVac.Platform;

/// <summary>
/// Pilnuje, żeby działała jedna kopia DeskVac. Kolejne uruchomienia (menu kontekstowe, autostart,
/// powiadomienie, skrót) przekazują swoje argumenty do działającej kopii przez nazwany potok i kończą się.
/// </summary>
public sealed class SingleInstance : IDisposable
{
    private static readonly string Id = "DeskVac-" + Environment.UserName;
    private readonly Mutex _mutex;
    private readonly CancellationTokenSource _cts = new();
    private const int MaxPayload = 64 * 1024;
    private const int MaxArgs = 64;

    private SingleInstance(Mutex mutex) => _mutex = mutex;

    public static SingleInstance? TryAcquire()
    {
        var m = new Mutex(true, @"Local\" + Id, out bool created);
        if (created) return new SingleInstance(m);
        m.Dispose();
        return null;
    }

    /// <summary>Wysyła argumenty do działającej kopii. Ponawia przez kilka sekund (np. gdy pierwsza kopia dopiero startuje).</summary>
    public static bool Send(string[] args)
    {
        var payload = string.Join("\n", args.Length == 0 ? new[] { "--show" } : args);
        var deadline = DateTime.UtcNow.AddSeconds(6);
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                // CurrentUserOnly: łączymy się tylko z potokiem utworzonym przez to samo konto Windows
                // (inne konto na komputerze nie podszyje się pod DeskVac i nie odczyta przesyłanych ścieżek)
                using var client = new NamedPipeClientStream(".", Id, PipeDirection.Out, PipeOptions.CurrentUserOnly);
                client.Connect(500);
                var bytes = Encoding.UTF8.GetBytes(payload);
                client.Write(bytes, 0, bytes.Length);
                client.Flush();
                return true;
            }
            catch (Exception)
            {
                Thread.Sleep(200);
            }
        }
        return false;
    }

    /// <summary>Nasłuchuje argumentów od kolejnych uruchomień. Callback wywoływany na wątku w tle.</summary>
    public void Listen(Action<string[]> onArgs)
    {
        Task.Run(async () =>
        {
            while (!_cts.IsCancellationRequested)
            {
                try
                {
                    // CurrentUserOnly: potok dostępny wyłącznie dla bieżącego użytkownika
                    using var server = new NamedPipeServerStream(Id, PipeDirection.In, 1, PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                    await server.WaitForConnectionAsync(_cts.Token);

                    // limit: polecenia to krótkie argumenty i ścieżki – większe dane odrzucamy
                    var buffer = new byte[MaxPayload + 1];
                    int total = 0, read;
                    while (total <= MaxPayload && (read = await server.ReadAsync(buffer.AsMemory(total, buffer.Length - total), _cts.Token)) > 0)
                        total += read;
                    if (total > MaxPayload) continue;

                    var args = Encoding.UTF8.GetString(buffer, 0, total)
                        .Split('\n', StringSplitOptions.RemoveEmptyEntries)
                        .Take(MaxArgs)
                        .Where(a => a.Length <= 1024)
                        .ToArray();
                    if (args.Length > 0) onArgs(args);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception)
                {
                    await Task.Delay(200);
                }
            }
        });
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _mutex.ReleaseMutex(); } catch (Exception) { /* już zwolniony */ }
        _mutex.Dispose();
    }
}
