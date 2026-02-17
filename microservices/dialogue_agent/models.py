from pydantic import BaseModel, Field


class DialogueRequest(BaseModel):
    """Request body for the dialogue generation endpoint."""
    text: str = Field(
        ...,
        min_length=1,
        description="The raw input text to convert into a podcast-style dialogue.",
        examples=["Machine learning is a subset of artificial intelligence that enables systems to learn from data."]
    )


class DialogueTurn(BaseModel):
    """A single turn in the podcast dialogue."""
    speaker: str = Field(
        ...,
        description="The speaker name — e.g. 'Expert 1' or 'Expert 2'.",
        examples=["Expert 1", "Expert 2"]
    )
    text: str = Field(
        ...,
        description="What the speaker says in this turn.",
        examples=["That's a great point. From a technical perspective, it implies..."]
    )


class DialogueResponse(BaseModel):
    """Response containing the full podcast-style dialogue."""
    dialogue: list[DialogueTurn] = Field(
        ...,
        description="Ordered list of dialogue turns between two professionals."
    )
