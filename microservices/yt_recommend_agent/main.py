from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from tools.topics_agent import extract_topics
from tools.yt_search import search_youtube_videos, attach_thumbnails


app = FastAPI(title="PDF Topic Extractor API")


# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PDFText(BaseModel):
    text: str


@app.post("/extract_topics")
async def topics(data: PDFText):
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    topics = await extract_topics(data.text)
    videos = search_youtube_videos(topics)
    videos = attach_thumbnails(videos)

    return {
        "topics": topics,
        "videos": videos
    }


@app.get("/")
async def health():
    return {"status": "running"}
