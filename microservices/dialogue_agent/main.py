from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import DialogueRequest, DialogueResponse
from dialogue_generator import generate_dialogue
from audio_generator import generate_audio_from_dialogue
from fastapi.responses import Response

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Professional Dialogue Generator",
    description="Converts raw text into a conversation between two professionals discussing the topic.",
    version="1.0.0",
)

# Allow all origins for hackathon ease
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
async def health_check():
    """Simple health-check endpoint."""
    return {"status": "ok"}


@app.post("/generate-dialogue", response_model=DialogueResponse)
async def create_dialogue(request: DialogueRequest):
    """
    Accepts raw text and returns a dialogue between two professionals
    discussing the content, powered by Google Gemini.
    """
    try:
        turns = await generate_dialogue(request.text)
        return DialogueResponse(dialogue=turns)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to parse model response: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {exc}",
        )
@app.post("/generate-audio")
async def generate_audio_endpoint(request: DialogueRequest):
    """
    Accepts raw text, generates a dialogue, and then converts it to audio
    using Gemini 2.5 Pro TTS (preview).
    Returns a WAV file.
    """
    # 1. Generate Dialogue (Reuse existing logic)
    dialogue_turns = await generate_dialogue(request.text)
    
    # 2. Generate Audio
    try:
        audio_bytes = await generate_audio_from_dialogue(dialogue_turns)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # 3. Return Audio File
    return Response(
        content=audio_bytes, 
        media_type="audio/mpeg",
        headers={"Content-Disposition": "attachment; filename=dialogue.mp3"}
    )
