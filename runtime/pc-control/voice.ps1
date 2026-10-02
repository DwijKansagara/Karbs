param([ValidateSet('listen','speak')][string]$Mode)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
try {
    if($Mode -eq 'speak') {
        $text=[Console]::In.ReadToEnd()
        $speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer
        try {$speaker.SetOutputToDefaultAudioDevice();$speaker.Speak($text)}finally{$speaker.Dispose()}
    } else {
        $recognizer=New-Object System.Speech.Recognition.SpeechRecognitionEngine
        try {
            $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
            $recognizer.SetInputToDefaultAudioDevice()
            $heard=$recognizer.Recognize([TimeSpan]::FromSeconds(12))
            if($heard){[Console]::Write($heard.Text)}
        } finally {$recognizer.Dispose()}
    }
}catch{[Console]::Error.WriteLine($_.Exception.Message);exit 1}
