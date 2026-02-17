from fastapi import FastAPI
from utils.router_logic import router

app = FastAPI(title="lecture teaching api")

app.include_router(router)


@app.get("/")
async def health():
    return {"status": "running"}
