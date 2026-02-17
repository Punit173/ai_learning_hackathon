from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import DialogueRequest, DialogueResponse
from dialogue_generator import generate_dialogue

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
