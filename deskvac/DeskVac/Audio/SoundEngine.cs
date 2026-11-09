using System.Reflection;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace DeskVac.Audio;

/// <summary>
/// Odtwarzanie dźwięków: jeden ciągły „głos” silnika (rozruch → pętla → wybieg)
/// plus krótkie efekty miksowane na bieżąco. Pliki WAV są wkompilowane w .exe.
/// </summary>
public sealed class SoundEngine : IDisposable
{
    private static readonly WaveFormat Format = WaveFormat.CreateIeeeFloatWaveFormat(44100, 2);

    private readonly Dictionary<string, float[]> _clips = new();
    private readonly MixingSampleProvider _mixer = new(Format) { ReadFully = true };
    private readonly VolumeSampleProvider _master;
    private readonly MotorVoice _motor;
    private readonly Random _rng = new();
    private WaveOutEvent? _output;
    private DateTime _lastPing = DateTime.MinValue;

    public bool Enabled { get; set; } = true;

    /// <summary>Głośność 0..1.</summary>
    public float Volume
    {
        get => _master.Volume;
        set => _master.Volume = Math.Clamp(value, 0f, 1f);
    }

    public SoundEngine()
    {
        foreach (var name in new[]
                 {
                     "motor_start", "motor_loop", "motor_stop", "suck1", "suck2", "suck3", "chime_start",
                     "chime_done", "ping", "scan", "skip", "dock", "empty",
                 })
        {
            _clips[name] = LoadClip(name);
        }

        _motor = new MotorVoice(_clips["motor_start"], _clips["motor_loop"], _clips["motor_stop"]);
        _mixer.AddMixerInput(_motor);
        _master = new VolumeSampleProvider(_mixer) { Volume = 0.8f };

        try
        {
            _output = new WaveOutEvent { DesiredLatency = 120, NumberOfBuffers = 3 };
            _output.Init(_master);
            _output.Play();
        }
        catch (Exception)
        {
            // brak urządzenia audio – aplikacja działa dalej bez dźwięku
            _output = null;
        }
    }

    // ------------------------------------------------------------------ API

    public void Play(string name, float volume = 1f, float pan = 0f)
    {
        if (!Enabled || _output is null || !_clips.TryGetValue(name, out var clip)) return;
        _mixer.AddMixerInput(new ClipVoice(clip, volume, pan));
    }

    public void PlaySuck(float pan) => Play("suck" + _rng.Next(1, 4), 0.9f, pan);

    /// <summary>Krótki „ping” lidaru, nie częściej niż co 70 ms.</summary>
    public void PlayPing(float pan)
    {
        var now = DateTime.UtcNow;
        if ((now - _lastPing).TotalMilliseconds < 70) return;
        _lastPing = now;
        Play("ping", 0.6f, pan);
    }

    public void MotorStart()
    {
        if (Enabled) _motor.Start();
    }

    public void MotorStop() => _motor.Stop();

    public float MotorPan
    {
        set => _motor.TargetPan = Math.Clamp(value, -1f, 1f);
    }

    public void Dispose()
    {
        _output?.Stop();
        _output?.Dispose();
        _output = null;
    }

    // ------------------------------------------------------------------ ładowanie

    private static float[] LoadClip(string name)
    {
        var asm = Assembly.GetExecutingAssembly();
        var res = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith($".{name}.wav", StringComparison.OrdinalIgnoreCase));
        if (res is null) return Array.Empty<float>();

        using var stream = asm.GetManifestResourceStream(res)!;
        using var reader = new WaveFileReader(stream);
        ISampleProvider sp = reader.ToSampleProvider();
        if (sp.WaveFormat.Channels == 1) sp = new MonoToStereoSampleProvider(sp);

        var data = new List<float>((int)(reader.SampleCount * 2));
        var buf = new float[8192];
        int n;
        while ((n = sp.Read(buf, 0, buf.Length)) > 0)
            for (int i = 0; i < n; i++) data.Add(buf[i]);
        return data.ToArray();
    }

    // ------------------------------------------------------------------ głosy

    private static (float L, float R) PanGains(float pan) =>
        (Math.Min(1f, 1f - pan), Math.Min(1f, 1f + pan));

    /// <summary>Jednorazowy efekt; mikser usuwa go sam po zakończeniu.</summary>
    private sealed class ClipVoice : ISampleProvider
    {
        private readonly float[] _data;
        private readonly float _gl, _gr;
        private int _pos;

        public ClipVoice(float[] data, float volume, float pan)
        {
            _data = data;
            var (l, r) = PanGains(pan);
            _gl = l * volume;
            _gr = r * volume;
        }

        public WaveFormat WaveFormat => Format;

        public int Read(float[] buffer, int offset, int count)
        {
            int n = Math.Min(count, _data.Length - _pos) & ~1;
            for (int i = 0; i < n; i += 2)
            {
                buffer[offset + i] = _data[_pos + i] * _gl;
                buffer[offset + i + 1] = _data[_pos + i + 1] * _gr;
            }
            _pos += n;
            return n;
        }
    }

    /// <summary>
    /// Silnik odkurzacza: rozruch → pętla bez przerw → wybieg (z przenikaniem z miejsca,
    /// w którym pętla akurat jest). Zawsze w mikserze, w ciszy zwraca zera.
    /// </summary>
    private sealed class MotorVoice : ISampleProvider
    {
        private enum State { Silent, Starting, Looping, Stopping }

        private const int CrossfadeFrames = 44100 * 15 / 100; // 150 ms przejścia pętla → wybieg
        private const int GateFrames = 441;                   // 10 ms wyciszenia przy restarcie

        private readonly float[] _start, _loop, _stop;
        private readonly object _lock = new();
        private State _state = State.Silent;
        private int _pos;        // pozycja w bieżącym klipie (próbki, nie ramki)
        private float[]? _xfSrc; // klip, z którego przenikamy w wybieg
        private int _xfPos;      // pozycja w tym klipie
        private int _xf;         // licznik przenikania
        private int _gate = -1;  // >=0: trwa wyciszanie przed restartem
        private float _pan;

        public float TargetPan { get; set; }

        public MotorVoice(float[] start, float[] loop, float[] stop)
        {
            _start = start;
            _loop = loop;
            _stop = stop;
        }

        public WaveFormat WaveFormat => Format;

        public void Start()
        {
            lock (_lock)
            {
                if (_state is State.Starting or State.Looping || _loop.Length == 0) return;
                if (_state == State.Stopping) _gate = GateFrames; // najpierw krótko wycisz, potem rozruch
                else { _state = State.Starting; _pos = 0; }
            }
        }

        public void Stop()
        {
            lock (_lock)
            {
                if (_state is State.Starting or State.Looping)
                {
                    // przenikamy z dokładnie tego miejsca, które właśnie gra
                    _xfSrc = _state == State.Looping ? _loop : _start;
                    _xfPos = _pos;
                    _xf = 0;
                    _state = State.Stopping;
                    _pos = 0;
                }
                _gate = -1;
            }
        }

        public int Read(float[] buffer, int offset, int count)
        {
            lock (_lock)
            {
                for (int i = 0; i < count; i += 2)
                {
                    _pan += (TargetPan - _pan) * 0.0005f;
                    float l = 0, r = 0;

                    switch (_state)
                    {
                        case State.Starting:
                            l = _start[_pos]; r = _start[_pos + 1];
                            _pos += 2;
                            if (_pos >= _start.Length) { _state = State.Looping; _pos = 0; }
                            break;

                        case State.Looping:
                            l = _loop[_pos]; r = _loop[_pos + 1];
                            _pos += 2;
                            if (_pos >= _loop.Length) _pos = 0;
                            break;

                        case State.Stopping:
                            if (_pos < _stop.Length)
                            {
                                l = _stop[_pos]; r = _stop[_pos + 1];
                                _pos += 2;
                            }
                            if (_xf < CrossfadeFrames && _xfSrc is not null)
                            {
                                // przenikanie: dotychczasowy dźwięk wygasa, wybieg narasta
                                float k = (float)_xf / CrossfadeFrames;
                                float fo = MathF.Cos(k * MathF.PI / 2), fi = MathF.Sin(k * MathF.PI / 2);
                                if (_xfPos >= _xfSrc.Length && ReferenceEquals(_xfSrc, _loop)) _xfPos = 0;
                                float pl = _xfPos < _xfSrc.Length ? _xfSrc[_xfPos] : 0f;
                                float pr = _xfPos < _xfSrc.Length ? _xfSrc[_xfPos + 1] : 0f;
                                l = l * fi + pl * fo;
                                r = r * fi + pr * fo;
                                _xfPos += 2;
                                _xf++;
                            }
                            if (_pos >= _stop.Length) _state = State.Silent;
                            break;
                    }

                    if (_gate >= 0)
                    {
                        float g = (float)_gate / GateFrames;
                        l *= g; r *= g;
                        if (--_gate < 0) { _state = State.Starting; _pos = 0; }
                    }

                    var (gl, gr) = PanGains(_pan * 0.6f);
                    buffer[offset + i] = l * gl;
                    buffer[offset + i + 1] = r * gr;
                }
            }
            return count;
        }
    }
}
