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
                using var client = new NamedPipeClientStream(".", Id, PipeDirection.Out);
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
                    using var server = new NamedPipeServerStream(Id, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                    await server.WaitForConnectionAsync(_cts.Token);
                    using var reader = new StreamReader(server, Encoding.UTF8);
                    var text = await reader.ReadToEndAsync();
                    var args = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
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
