//app/api/chat/route.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { buildStrategicContext } from "@/lib/intelligence";
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { message, companyId, history } = await req.json();

    // 1. Build Context
    const intelligence = await buildStrategicContext(companyId);
    
    if (!intelligence) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }

    // 2. Prepare Images (Multimodal) - Same as before
    const imageParts: any[] =[];
    const fetchImageForAI = async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        return {
          inlineData: {
            data: Buffer.from(arrayBuffer).toString("base64"),
            mimeType: "image/jpeg",
          },
        };
      } catch (e) {
        console.error("Failed to load image for AI", e);
        return null;
      }
    };

    // Grab a few key images for context
    const marketingAsset = intelligence.assets.find((a: any) => a.type === 'post' && a.imageUrl);
    const productAsset = intelligence.assets.find((a: any) => a.type === 'screen' && a.imageUrl);

    if (marketingAsset?.imageUrl) {
        const img = await fetchImageForAI(marketingAsset.imageUrl);
        if(img) imageParts.push(img);
    }
    if (productAsset?.imageUrl) {
        const img = await fetchImageForAI(productAsset.imageUrl);
        if(img) imageParts.push(img);
    }
    

    // 3. UPDATED SYSTEM PROMPT
    const systemPrompt = `
    You are the Strategic AI Analyst for CompetitorOS.
    You have deep intelligence on: ${companyId}.

    **YOUR DATASET:**
    ${intelligence.contextText}

    **BEHAVIOR GUIDELINES:**
    1. **Be Conversational:** If the user says "Hi" or "Hello", respond briefly and politely. Introduce yourself as the analyst for ${companyId} and ask what they want to know. Do NOT dump a summary unless asked.
    2. **Be Insightful:** When asked a question, connect the dots. (e.g., "They are hiring React devs AND their mobile app hasn't updated in 6 months -> Likely a rewrite coming").
    3. **Cite Sources:** If you reference a specific Job, Post, or Screen from the dataset, you MUST include its ID (e.g., 'job_2', 'post_5') in the 'citations' array.

    **OUTPUT FORMAT (JSON):**
    {
      "answer": "Your conversational response here...",
      "citations": ["id_of_asset_1", "id_of_asset_2"]
    }
    `;

    // 4. Call Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    
    const chat = model.startChat({
      history: history || [],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const result = await chat.sendMessage([
      systemPrompt, 
      ...imageParts, 
      `USER: ${message}`
    ]);

    const responseText = result.response.text();
    
    let parsedResponse;
    try {
        parsedResponse = JSON.parse(responseText);
    } catch (e) {
        parsedResponse = { answer: responseText, citations: [] };
    }

    // 5. Enrich Citations
    const enrichedCitations = parsedResponse.citations?.map((id: string) => {
        return intelligence.assets.find(a => a.id === id);
    }).filter((x: any) => x !== undefined) || [];

    return NextResponse.json({ 
      answer: parsedResponse.answer,
      citations: enrichedCitations
    });

  } catch (error) {
    console.error("Chat Error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}