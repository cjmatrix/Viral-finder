const { getTranscript } = require('../services/transcriptService');
const { chunkTranscript } = require('../services/chunkService');
const { triageChunks, refineTopClips, detectStories, refineStorySegments } = require('../services/llmService');
const { downloadVideo, downloadVideoSection, getTrackingData, processClip, processStoryClip } = require('../services/videoService');
const path = require('path');
const fs = require('fs');

const analyzeVideo = async (req, res) => {
    try {
        const { url, strategy, clipCount = 4 } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: "YouTube URL is required." });
        }

        // 1. Fetch Transcript
        console.log(`Fetching transcript for URL: ${url}`);
        const transcript = await getTranscript(url);

        // 2. Chunk into 90s windows (30s overlap)
        console.log("Chunking transcript...");
        const chunks = chunkTranscript(transcript, 90, 30);

        // 3. Stage 1: Lightweight Triage
        console.log("Stage 1: Triaging chunks...");
        const top10Chunks = await triageChunks(chunks);
        
        if (top10Chunks.length === 0) {
            return res.status(500).json({ error: "Failed to score chunks during Stage 1 triage." });
        }

        // 4. Stage 2: Main LLM Re-Ranking & Pacing Trim
        console.log(`Stage 2: Refining top 10 chunks to top ${clipCount}...`);
        const topClips = await refineTopClips(top10Chunks, clipCount);

        // ============================================================
        // STORY MODE — separate pipeline
        // ============================================================
        if (strategy === 'story-mode') {
            console.log(`Story Mode: Detecting ${clipCount} connected story arcs...`);
            const stories = await detectStories(chunks, clipCount); // Use ALL chunks for story detection
            const finalStoryClips = [];

            for (const story of stories) {
                // Get the full chunk objects for this story's chunk_ids
                const relatedChunks = chunks.filter(c => story.chunk_ids.includes(c.chunk_id));
                if (relatedChunks.length === 0) continue;

                console.log(`Refining story: "${story.title}" (${relatedChunks.length} chunks)...`);
                const refinedStory = await refineStorySegments(story, relatedChunks);

                const outputFileName = `story_${Date.now()}_${story.story_id}.mp4`;
                const outputPath = path.join(__dirname, '../../clips', outputFileName);

                try {
                    await processStoryClip(url, refinedStory, outputPath, transcript);
                    finalStoryClips.push({
                        rank: story.story_id,
                        title: refinedStory.title,
                        hook: refinedStory.hook,
                        virality_score: refinedStory.virality_score,
                        reason: refinedStory.reason,
                        start_time: refinedStory.segments[0].start_time,
                        end_time: refinedStory.segments[refinedStory.segments.length - 1].end_time,
                        segments: refinedStory.segments,
                        video_url: `http://localhost:5000/clips/${outputFileName}`
                    });
                } catch (err) {
                    console.error(`Failed to process story ${story.story_id}:`, err.message);
                }
            }

            return res.json({ video_id: url, clips: finalStoryClips });
        }

        // 5. Download and Process the video sections (pipelined for speed)
        console.log("Downloading and processing clip sections...");
        const finalClips = [];

        // Apply padding to all clips upfront (3s start, 10s end)
        for (const clip of topClips) {
            clip.start_time = Math.max(0, clip.start_time - 3);
            clip.end_time = clip.end_time + 10;
        }

        // Pre-fetch first clip's download
        let nextDownloadPromise = (async () => {
            const clip = topClips[0];
            console.log(`Downloading section for clip ${clip.rank} (${clip.start_time} to ${clip.end_time})...`);
            return downloadVideoSection(url, clip.start_time, clip.end_time);
        })();

        for (let i = 0; i < topClips.length; i++) {
            const clip = topClips[i];

            // Wait for current clip's download
            const sectionVideoPath = await nextDownloadPromise;

            // Immediately kick off next clip's download in the background
            if (i + 1 < topClips.length) {
                const nextClip = topClips[i + 1];
                nextDownloadPromise = (async () => {
                    console.log(`Downloading section for clip ${nextClip.rank} (${nextClip.start_time} to ${nextClip.end_time})...`);
                    return downloadVideoSection(url, nextClip.start_time, nextClip.end_time);
                })();
            }

            console.log(`Running YOLO tracking for clip ${clip.rank}...`);
            const trackingResponse = await getTrackingData(sectionVideoPath);
            const trackingData = trackingResponse.data;
            const uniqueObjects = trackingResponse.unique_objects || [];

            const outputFileName = `clip_${Date.now()}_${i}.mp4`;
            const outputPath = path.join(__dirname, '../../clips', outputFileName);
            
            try {
                await processClip(sectionVideoPath, clip, outputPath, trackingData, uniqueObjects, transcript, true, strategy || 'standard');
                clip.video_url = `http://localhost:5000/clips/${outputFileName}`;
                finalClips.push(clip);
                
                if (fs.existsSync(sectionVideoPath)) {
                    fs.unlinkSync(sectionVideoPath);
                }
            } catch (err) {
                console.error(`Failed to process clip ${clip.rank}`);
            }
        }

        res.json({
            video_id: url,
            clips: finalClips
        });

    } catch (error) {
        console.error("Error analyzing video:", error);
        const errorMessage = error.message || "An unexpected error occurred.";
        res.status(500).json({ error: errorMessage });
    }
};

module.exports = {
    analyzeVideo
};
