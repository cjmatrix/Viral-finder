
const { GoogleGenAI, Type, Schema } = require('@google/genai');
const dotenv = require('dotenv');

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Stage 1: Lightweight Triage
 * Scores chunks on Hook, Energy, Coherence. Filters to top 10.
 */
const triageChunks = async (chunks) => {
    try {
        // To avoid exceeding payload size or token limits, we could process in batches.
        // For a typical 10-20 min video, chunks array size is small enough to pass all at once to flash.
        
        const chunksData = chunks.map(c => `[ID: ${c.chunk_id} | ${c.start_time}s - ${c.end_time}s] ${c.text}`).join('\n\n');
        
        const prompt = `
You are a world-class viral video producer who has launched dozens of YouTube Shorts and TikToks with over 1 million views each.
Your task is to identify which segments of this transcript have the highest potential to go viral as a 45-60 second short-form clip.

Evaluate EACH chunk on these 3 dimensions (score 1-10 each):

1. HOOK STRENGTH (1-10)
   - Does it start mid-action, with a shocking statement, or a burning question?
   - Would a viewer instantly stop scrolling in the first 2 seconds?
   - Penalize heavily if the chunk starts with filler like "So", "Um", "Welcome back", or slow intros.

2. ENERGY / SHOCK VALUE (1-10)
   - Is there raw emotion: laughter, anger, disbelief, fear, or hype?
   - Does something unexpected or controversial happen?
   - Reward: arguments, reactions, plot twists, unexpected confessions, pranks, challenges, flex moments.

3. STANDALONE COHERENCE (1-10)
   - Can a viewer understand and enjoy this clip WITHOUT watching the full video?
   - Is there a clear beginning, middle, and end within this window?
   - Penalize if the clip cuts off mid-sentence or requires heavy context from the rest of the video.

Here are the transcript chunks to evaluate:
${chunksData}
`;

        const responseSchema = {
            type: Type.ARRAY,
            description: "List of chunk evaluations",
            items: {
                type: Type.OBJECT,
                properties: {
                    chunk_id: { type: Type.INTEGER },
                    hook_score: { type: Type.INTEGER },
                    energy_score: { type: Type.INTEGER },
                    coherence_score: { type: Type.INTEGER },
                    total_score: { type: Type.INTEGER }
                },
                required: ["chunk_id", "hook_score", "energy_score", "coherence_score", "total_score"]
            }
        };
        //low model
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.2
            }
        });

        if (!response.text) {
            console.error("Stage 1 - No text in response. Raw response:", JSON.stringify(response, null, 2));
            throw new Error("Stage 1 model returned an empty response. It may have been blocked by safety filters.");
        }
        const evaluations = JSON.parse(response.text);
        
        // Merge scores back into chunks
        const scoredChunks = chunks.map(c => {
            const evalData = evaluations.find(e => e.chunk_id === c.chunk_id) || { total_score: 0 };
            return {
                ...c,
                score: evalData.total_score
            };
        });

        // Sort by score descending and take top 10
        const top10 = scoredChunks.sort((a, b) => b.score - a.score).slice(0, 10);
        console.log("Top 10 Viral Moments (Stage 1 Output):", JSON.stringify(top10, null, 2));
        return top10;

    } catch (error) {
        console.error("Error in triageChunks:", error);
        throw error;
    }
};

/**
 * Stage 2: Refines the top raw chunks into precise, highly viral clips
 */
const refineTopClips = async (chunks, clipCount = 4) => {
    try {
        const chunksData = chunks.map(c => `[ID: ${c.chunk_id} | ${c.start_time}s - ${c.end_time}s]\n${c.text}`).join('\n\n---\n\n');
        
        const prompt = `
You are an expert short-form content editor (TikTok/Reels/Shorts). 
I am giving you the top most engaging moments from a livestream transcript.

Your job is to select the TOP ${clipCount} ABSOLUTE BEST moments and define the exact start and end times for the final video cut.

## YOUR OBJECTIVE
Select ${clipCount} clips that will generate maximum watch time, shares, and comments. Prioritize emotional peaks, shocking moments, and strong payoffs.

## RULES FOR TIMESTAMP SELECTION (CRITICAL)
- The timestamps you output ARE used directly to cut the video. Be surgically precise.
- start_time: Set this to the EXACT second where the energy/hook begins. NOT before. Skip all slow intros.
  * The FIRST words of the clip must create instant curiosity or shock.
  * Never start on filler words ("so", "um", "like", "alright guys").
- end_time: Set this to the EXACT second after the punchline/climax fully lands and the energy naturally resolves.
  * Never cut off mid-sentence or mid-reaction.
  * Allow 1-2 seconds of natural reaction/silence AFTER the punchline so it lands properly.
- The clip duration (end_time - start_time) MUST be between 40 and 65 seconds. Clips shorter than 40 seconds or longer than 65 will be rejected.
- ALL timestamps are in seconds from the start of the full source video.
- start_time and end_time MUST fall WITHIN the candidate window's boundaries.

## SFX PLACEMENT
Add sound effects at precise moments to punch up the energy:
- 'pop': right when a funny or unexpected moment hits
- 'boom': when something dramatic or shocking happens
- 'whoosh': during a quick transition or when someone enters/exits
- 'ding': when someone gets roasted or at a satisfying payoff
- SFX timestamps are also in seconds from the start of the full video.

## CANDIDATE CLIPS
${chunksData}
`;

        const responseSchema = {
            type: Type.ARRAY,
            description: `List of top ${clipCount} clips`,
            items: {
                type: Type.OBJECT,
                properties: {
                    rank: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    hook: { type: Type.STRING, description: "A short summary of the hook" },
                    start_time: { type: Type.NUMBER },
                    end_time: { type: Type.NUMBER },
                    virality_score: { type: Type.INTEGER },
                    reason: { type: Type.STRING },
                    sfx_moments: {
                        type: Type.ARRAY,
                        description: "List of SFX moments",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                timestamp: { type: Type.NUMBER, description: "Time in seconds relative to the full video" },
                                type: { type: Type.STRING, description: "'pop', 'whoosh', 'boom', or 'ding'" }
                            },
                            required: ["timestamp", "type"]
                        }
                    }
                },
                required: ["rank", "title", "hook", "start_time", "end_time", "virality_score", "reason", "sfx_moments"]
            }
        };
        //high
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.4
            }
        });

        if (!response.text) {
            console.error("Stage 2 - No text in response. Raw response:", JSON.stringify(response, null, 2));
            throw new Error("Stage 2 model returned an empty response. It may have been blocked by safety filters.");
        }
        const clips = JSON.parse(response.text);
        return clips;

    } catch (error) {
        console.error("Error in refineTopClips:", error);
        throw error;
    }
};

module.exports = {
    triageChunks,
    refineTopClips,
    detectStories,
    refineStorySegments
};

/**
 * Story Mode - Stage 1: Story Detector (Flash LLM)
 * Reads ALL chunks and groups them into connected story arcs.
 */
async function detectStories(chunks, clipCount = 2) {
    try {
        const chunksData = chunks.map(c => `[ID: ${c.chunk_id} | ${c.start_time}s - ${c.end_time}s]\n${c.text}`).join('\n\n---\n\n');

        const prompt = `
You are an expert story analyst for viral livestream content. Your job is to find CONNECTED STORY ARCS that span across multiple separate moments in a long stream.

A "story arc" means: a setup moment + a payoff/reaction moment that happened at DIFFERENT times in the stream, but together form a satisfying narrative. For example:
- Someone gets roasted → secretly does something nice about it → gets revealed later
- A dare is proposed → accepted → completed/failed reaction is shown
- A challenge is issued → attempt happens → result and reaction

Find the ${clipCount} BEST connected story arcs from these transcript chunks.
Each story MUST reference at least 2 different chunk IDs (moments that are connected).
Only include chunks that are genuinely part of the story — don't add filler chunks.

Here are all the transcript chunks:
${chunksData}
`;

        const responseSchema = {
            type: Type.ARRAY,
            description: `List of ${clipCount} story arcs`,
            items: {
                type: Type.OBJECT,
                properties: {
                    story_id: { type: Type.INTEGER },
                    title: { type: Type.STRING, description: "A viral-worthy title for this story" },
                    description: { type: Type.STRING, description: "1-2 sentence description of the story arc" },
                    chunk_ids: {
                        type: Type.ARRAY,
                        description: "Ordered list of chunk IDs that make up this story, in chronological order",
                        items: { type: Type.INTEGER }
                    }
                },
                required: ["story_id", "title", "description", "chunk_ids"]
            }
        };
        //low model
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.3
            }
        });

        if (!response.text) throw new Error("Story detector returned empty response.");
        const stories = JSON.parse(response.text);
        console.log("Story Mode - Detected stories:", JSON.stringify(stories, null, 2));
        return stories;

    } catch (error) {
        console.error("Error in detectStories:", error);
        throw error;
    }
}

/**
 * Story Mode - Stage 2: Story Editor (Main LLM)
 * Takes the grouped chunks for one story and outputs precise cut segments.
 */
async function refineStorySegments(story, relatedChunks) {
    try {
        const chunksData = relatedChunks.map(c => `[ID: ${c.chunk_id} | Window: ${c.start_time}s - ${c.end_time}s]\n${c.text}`).join('\n\n---\n\n');

        const prompt = `
You are a viral short-form video editor. You have identified the following connected story arc from a long stream:

STORY: "${story.title}"
DESCRIPTION: ${story.description}

Your job is to define the EXACT video segments to cut from each moment and join them together into one short-form video that is UNDER 60 SECONDS total.

## RULES FOR SEGMENTS (CRITICAL)
- Each segment has a start_time and end_time in seconds from the START of the full original video.
- Segments must be in CHRONOLOGICAL ORDER.
- Each individual segment should be between 5-30 seconds long.
- Total video length when all segments are joined MUST BE UNDER 60 SECONDS (ideally 30-59 seconds). This is a strict requirement.
- start_time of each segment must fall WITHIN its source chunk's window.
- end_time must fall WITHIN its source chunk's window.
- Cut in at the exact moment the relevant action/dialogue begins — skip filler words.
- Cut out right after the payoff/reaction lands — don't include dead air.
- Each segment must make sense on its own AND contribute to the overall story.

## SFX PLACEMENT
Place sound effects at key moments. Timestamps are in seconds from the START OF THE FULL VIDEO (not relative to segment start):
- 'whoosh': at the FIRST frame of each new segment (signals a jump cut to viewers)
- 'pop': right when something funny or unexpected hits
- 'boom': when something dramatic or shocking happens
- 'ding': at the satisfying final payoff/reveal

## SOURCE CHUNKS FOR THIS STORY
${chunksData}
`;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                story_id: { type: Type.INTEGER },
                title: { type: Type.STRING },
                virality_score: { type: Type.INTEGER },
                hook: { type: Type.STRING, description: "First line a viewer hears — must be compelling" },
                reason: { type: Type.STRING },
                segments: {
                    type: Type.ARRAY,
                    description: "Ordered list of video segments to download and concatenate",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            start_time: { type: Type.NUMBER },
                            end_time: { type: Type.NUMBER },
                            label: { type: Type.STRING, description: "Short label for this segment, e.g. 'The Setup' or 'The Payoff'" }
                        },
                        required: ["start_time", "end_time", "label"]
                    }
                },
                sfx_moments: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            timestamp: { type: Type.NUMBER },
                            type: { type: Type.STRING }
                        },
                        required: ["timestamp", "type"]
                    }
                }
            },
            required: ["story_id", "title", "virality_score", "hook", "reason", "segments", "sfx_moments"]
        };
        //high
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.3
            }
        });

        if (!response.text) throw new Error("Story refiner returned empty response.");
        const result = JSON.parse(response.text);
        console.log("Story Mode - Refined segments:", JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error("Error in refineStorySegments:", error);
        throw error;
    }
}
