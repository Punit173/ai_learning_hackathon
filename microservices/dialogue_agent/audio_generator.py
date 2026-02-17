import asyncio
import edge_tts
from models import DialogueTurn

# Voice constants
VOICE_MALE = "en-US-ChristopherNeural"  # Teacher / Expert 1
VOICE_FEMALE = "en-US-AriaNeural"       # Student / Expert 2

async def generate_audio_from_dialogue(dialogue: list[DialogueTurn]) -> bytes:
    """
    Takes a list of DialogueTurns and generates a single audio file (MP3 bytes)
    using edge-tts (Microsoft Edge Online TTS) with multi-speaker configuration.
    """
    
    combined_audio = bytearray()

    for turn in dialogue:
        speaker_label = turn.speaker
        text = turn.text
        
        # Select voice based on speaker
        # Default logic: Teacher/Expert 1/Speaker 1 -> Male
        #                Student/Expert 2/Speaker 2 -> Female
        if any(x in speaker_label for x in ["1", "First", "Teacher", "Expert 1"]):
            voice = VOICE_MALE
        elif any(x in speaker_label for x in ["2", "Second", "Student", "Expert 2"]):
            voice = VOICE_FEMALE
        else:
            # Fallback based on turn index or random? For now default to Male
            voice = VOICE_MALE

        communicate = edge_tts.Communicate(text, voice)
        
        # Accumulate audio bytes for this turn
        # edge-tts generates MP3 stream by default
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                combined_audio.extend(chunk["data"])

    return bytes(combined_audio)
