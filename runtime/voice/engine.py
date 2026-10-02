"""Coucou voice: local Whisper input, selectable natural or Windows output."""
import sys, os, json, time, asyncio, uuid
from pathlib import Path
ROOT = Path(os.environ['COUCOU_DATA_DIR']) / 'voice'
sys.path.insert(0, str(ROOT / 'site'))
os.environ['HF_HOME'] = str(ROOT / 'cache')
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
os.environ['PYTHONPYCACHEPREFIX'] = str(ROOT / 'cache/pycache')

def emit(**payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)

def model(download=False):
    from faster_whisper import WhisperModel
    return WhisperModel('small.en', device='cpu', compute_type='int8', cpu_threads=4,
                        download_root=str(ROOT / 'models'), local_files_only=not download)

def transcribe(audio, whisper):
    segments, _ = whisper.transcribe(audio, language='en', beam_size=5,
        condition_on_previous_text=False, vad_filter=True, vad_parameters={'min_silence_duration_ms':700},
        no_speech_threshold=0.6, initial_prompt='Karbs, Codex, Gemini, Visual Studio Code, Windows.')
    return ' '.join(s.text.strip() for s in segments if s.no_speech_prob < .6 and s.avg_logprob > -1).strip()

def listen():
    import numpy as np
    import sounddevice as sd
    emit(stage='loading')
    whisper = model()
    frames = []; heard = False; quiet = 0
    emit(stage='listening')
    with sd.InputStream(samplerate=16000, channels=1, dtype='float32', blocksize=1600) as stream:
        for _ in range(180):
            block, overflow = stream.read(1600)
            frames.append(block[:,0].copy())
            level = float(np.sqrt(np.mean(block * block)))
            if level > .008: heard = True; quiet = 0
            else: quiet += 1
            if heard and quiet >= 18 and len(frames) >= 30: break
            if not heard and len(frames) >= 100: break
    if not heard:
        raise RuntimeError('No speech heard. Check your default Windows microphone and speak after Listening appears.')
    emit(stage='transcribing')
    text = transcribe(np.concatenate(frames), whisper)
    if not text: raise RuntimeError('Could not understand that recording. Please speak clearly and try again.')
    emit(text=text)

async def generate(text, target):
    import edge_tts
    try: settings = json.loads((Path(os.environ['COUCOU_DATA_DIR']) / 'config/settings.json').read_text(encoding='utf-8'))
    except Exception: settings = {}
    voice = settings.get('speechVoice', 'en-IN-NeerjaNeural')
    if voice not in {'en-IN-NeerjaNeural','en-US-JennyNeural','en-GB-SoniaNeural'}: voice='en-IN-NeerjaNeural'
    await edge_tts.Communicate(text, voice, rate='-3%').save(str(target))

def speak():
    import av, numpy as np, sounddevice as sd
    text = sys.stdin.read().strip()
    if not text: return
    temporary = ROOT / 'temp'; temporary.mkdir(parents=True, exist_ok=True)
    target = temporary / (str(uuid.uuid4())+'.mp3')
    try:
        emit(stage='preparing')
        asyncio.run(asyncio.wait_for(generate(text, target), timeout=35))
        with av.open(str(target)) as container:
            resampler = av.AudioResampler(format='flt', layout='mono', rate=24000)
            frames = [out.to_ndarray().reshape(-1) for frame in container.decode(audio=0) for out in resampler.resample(frame)]
            frames += [out.to_ndarray().reshape(-1) for out in resampler.resample(None)]
        if not frames: raise RuntimeError('The speech service returned no audio.')
        emit(stage='speaking')
        sd.play(np.concatenate(frames), 24000); sd.wait()
        emit(stage='finished')
    finally:
        target.unlink(missing_ok=True)

try:
    mode = sys.argv[1]
    if mode == '--setup': model(download=True); emit(ready=True)
    elif mode == '--listen': listen()
    elif mode == '--speak': speak()
    elif mode == '--generate': asyncio.run(generate(sys.stdin.read(), Path(sys.argv[2]))); emit(generated=True)
    elif mode == '--transcribe': emit(text=transcribe(sys.argv[2], model()))
    else: raise RuntimeError('Unknown voice mode')
except Exception as error:
    emit(error=str(error)); sys.exit(1)
