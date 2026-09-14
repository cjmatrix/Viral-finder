const ytDlp = require('yt-dlp-exec');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const clipsDir = path.join(__dirname, '../../../backend/clips');
if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
}

/**
 * Download YouTube video to a temporary path
 */
const downloadVideo = async (url) => {
    const outputPath = path.join(clipsDir, `full_video_${Date.now()}.mp4`);
    console.log(`Downloading video from ${url}...`);
    
    await ytDlp(url, {
        f: 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]',
        o: outputPath,
        mergeOutputFormat: 'mp4',
    });
    
    return outputPath;
};

/**
 * Download a specific section of a YouTube video
 */
const downloadVideoSection = async (url, startTime, endTime) => {
    const outputPath = path.join(clipsDir, `section_${Date.now()}_${startTime}_${endTime}.mp4`);
    console.log(`Downloading video section from ${url} (${startTime}s to ${endTime}s)...`);
    
    await ytDlp(url, {
        f: 'bestvideo[vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
        o: outputPath,
        mergeOutputFormat: 'mp4',
        downloadSections: `*${startTime}-${endTime}`,
        forceKeyframesAtCut: true,
    });
    
    return outputPath;
};

/**
 * Call YOLO service to get bounding boxes
 */
const getTrackingData = async (videoPath) => {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(videoPath));
        
        console.log("Calling YOLO service...");
        const response = await axios.post('http://localhost:8000/analyze-video', formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        return response.data;
    } catch (e) {
        console.error("YOLO service error", e);
        return { data: [], unique_objects: [] };
    }
};

/**
 * Helper to format seconds to ASS timestamp format (H:MM:SS.CS)
 */
const formatTimeASS = (seconds) => {
    const d = new Date(seconds * 1000);
    const hrs = String(d.getUTCHours());
    const mins = String(d.getUTCMinutes()).padStart(2, '0');
    const secs = String(d.getUTCSeconds()).padStart(2, '0');
    const cs = String(Math.floor(d.getUTCMilliseconds() / 10)).padStart(2, '0');
    return `${hrs}:${mins}:${secs}.${cs}`;
};

/**
 * Generate ASS file for a clip (Animated CapCut style)
 */
const generateASS = (transcript, clipStartTime, clipEndTime, outputPath, strategy = 'standard') => {
    if (!transcript) return;
    
    const items = transcript.filter(item => {
        const itemStart = item.offset / 1000;
        const itemEnd = itemStart + (item.duration / 1000);
        return itemStart < clipEndTime && itemEnd > clipStartTime;
    });

    let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,90,&H0000FFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,4,5,10,10,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const fixedItems = items.map((item, i) => {
        let start = item.offset / 1000;
        let end = start + (item.duration / 1000);
        
        if (i < items.length - 1) {
            const nextStart = items[i + 1].offset / 1000;
            if (end > nextStart) {
                end = nextStart; // Prevent overlap
            }
        }
        return { ...item, start, end };
    });

    fixedItems.forEach(item => {
        let relativeStart = Math.max(0, item.start - clipStartTime);
        let relativeEnd = Math.min(clipEndTime - clipStartTime, item.end - clipStartTime);

        if (relativeEnd > relativeStart) {
            const words = item.text.replace(/\n/g, ' ').trim().split(/\s+/);
            const chunkDuration = (relativeEnd - relativeStart) / Math.ceil(words.length / 2);
            
            for (let i = 0; i < words.length; i += 2) {
                const chunkWords = words.slice(i, i + 2).join(' ');
                const chunkStart = relativeStart + (i / 2) * chunkDuration;
                const chunkEnd = chunkStart + chunkDuration;
                
                const startStr = formatTimeASS(chunkStart);
                const endStr = formatTimeASS(chunkEnd);
                
                const yPos = strategy === 'split-screen' ? 576 : 960;
                const textWithAnim = `{\\pos(540,${yPos})\\an5\\fscx50\\fscy50\\t(0,100,\\fscx100\\fscy100)\\fad(50,50)}${chunkWords}`;
                assContent += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${textWithAnim}\n`;
            }
        }
    });

    fs.writeFileSync(outputPath, assContent);
};

/**
 * Generates an .ass subtitle file correctly mapped to a multi-segment timeline for Story Mode
 */
const generateStoryASS = (transcript, segments, outputPath) => {
    let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,90,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    let videoOffset = 0; // Tracks the running time in the concatenated video

    for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        const segDuration = seg.end_time - seg.start_time;

        // Filter items that belong to this segment
        const items = transcript.filter(item => {
            const start = item.offset / 1000;
            return start >= seg.start_time && start <= seg.end_time;
        });

        const fixedItems = items.map((item, i) => {
            let start = item.offset / 1000;
            let end = start + (item.duration / 1000);
            
            if (i < items.length - 1) {
                const nextStart = items[i + 1].offset / 1000;
                if (end > nextStart) {
                    end = nextStart; // Prevent overlap
                }
            }
            return { ...item, start, end };
        });

        fixedItems.forEach(item => {
            let relativeStart = Math.max(0, item.start - seg.start_time) + videoOffset;
            let relativeEnd = Math.min(segDuration, item.end - seg.start_time) + videoOffset;

            if (relativeEnd > relativeStart) {
                const words = item.text.replace(/\n/g, ' ').trim().split(/\s+/);
                const chunkDuration = (relativeEnd - relativeStart) / Math.ceil(words.length / 2);
                
                for (let i = 0; i < words.length; i += 2) {
                    const chunkWords = words.slice(i, i + 2).join(' ');
                    const chunkStart = relativeStart + (i / 2) * chunkDuration;
                    const chunkEnd = chunkStart + chunkDuration;
                    
                    const startStr = formatTimeASS(chunkStart);
                    const endStr = formatTimeASS(chunkEnd);
                    
                    const textWithAnim = `{\\pos(540,960)\\an5\\fscx50\\fscy50\\t(0,100,\\fscx100\\fscy100)\\fad(50,50)}${chunkWords}`;
                    assContent += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${textWithAnim}\n`;
                }
            }
        });

        // Advance the running time by this segment's duration
        videoOffset += segDuration;
    }

    fs.writeFileSync(outputPath, assContent);
};

/**
 * Cut and crop the video to 9:16 based on center_x
 */
const processClip = (videoPath, clip, outputPath, trackingData, uniqueObjects = [], fullTranscript = null, isAlreadySectioned = false, strategy = 'standard') => {
    return new Promise((resolve, reject) => {
        // Find the average center_x for this specific clip duration
        let relevantBoxes = trackingData;
        if (!isAlreadySectioned) {
            relevantBoxes = trackingData.filter(d => d.time >= clip.start_time && d.time <= clip.end_time);
        }
        
        let avgCenterXRatio = 0.5; // Default center
        if (relevantBoxes.length > 0) {
            const sum = relevantBoxes.reduce((acc, curr) => acc + curr.center_x_ratio, 0);
            avgCenterXRatio = sum / relevantBoxes.length;
        }

        const cropFilter = `crop=ih*(9/16):ih:max(0\\,min(iw-ih*(9/16)\\,iw*${avgCenterXRatio}-ih*(9/16)/2)):0`;

        console.log(`Processing clip ${clip.rank} (${clip.start_time} to ${clip.end_time}) with crop center ${avgCenterXRatio.toFixed(2)}`);
        
        let command = ffmpeg(videoPath);
        
        if (!isAlreadySectioned) {
            command = command.setStartTime(clip.start_time);
        }
        command = command.setDuration(clip.end_time - clip.start_time);

        const filterComplex = [];
        let inputIndex = 1;
        let voutName = null;

        // --- SUBTITLES ---
        let subPath = null;
        if (fullTranscript) {
            subPath = path.join(clipsDir, `subs_${Date.now()}_${clip.rank}.ass`);
            generateASS(fullTranscript, clip.start_time, clip.end_time, subPath, strategy);
        }

        // --- GAMEPLAY (SPLIT-SCREEN) ---
        const gameplayDir = path.join(__dirname, '../../gameplay');
        let gameplayFile = null;
        if (strategy === 'split-screen' && fs.existsSync(gameplayDir)) {
            const files = fs.readdirSync(gameplayDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mov') || f.endsWith('.mkv'));
            if (files.length > 0) {
                gameplayFile = path.join(gameplayDir, files[Math.floor(Math.random() * files.length)]);
            }
        }

        if (gameplayFile) {
            command = command.input(gameplayFile).inputOptions(['-stream_loop -1']); // Loop forever to match clip length
            
            // Top crop (9:8 aspect ratio)
            const topCrop = `crop=ih*(9/8):ih:max(0\\,min(iw-ih*(9/8)\\,iw*${avgCenterXRatio}-ih*(9/8)/2)):0,scale=1080:960,setsar=1`;
            // Bottom crop (gameplay)
            const bottomCrop = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:960,setsar=1`;
            
            filterComplex.push(`[0:v]${topCrop}[top]`);
            filterComplex.push(`[${inputIndex}:v]${bottomCrop}[bottom]`);
            
            let vstackCmd = `[top][bottom]vstack=inputs=2`;
            if (subPath) vstackCmd += `,subtitles='${subPath}'`;
            filterComplex.push(`${vstackCmd}[vout]`);
            
            voutName = '[vout]';
            inputIndex++;
        } else {
            let videoFilterStr = `crop=ih*(9/16):ih:max(0\\,min(iw-ih*(9/16)\\,iw*${avgCenterXRatio}-ih*(9/16)/2)):0`;
            if (subPath) videoFilterStr += `,subtitles='${subPath}'`;
            filterComplex.push(`[0:v]${videoFilterStr}[vout]`);
            voutName = '[vout]';
        }

        // --- SFX & BACKGROUND AUDIO MIXING ---
        let sfxCount = 0;
        const allSfx = [];
        
        if (clip.sfx_moments) {
            clip.sfx_moments.forEach(m => {
                const relTime = m.timestamp - clip.start_time;
                if (relTime >= 0 && relTime <= (clip.end_time - clip.start_time)) {
                     allSfx.push({ time: relTime, type: m.type || 'pop' });
                }
            });
        }
        
        uniqueObjects.forEach(obj => {
            allSfx.push({ time: obj.timestamp, type: 'whoosh' });
        });

        const sfxDir = path.join(__dirname, '../../sfx');
        const bgSoundDir = path.join(__dirname, '../../bg-sound');
        
        let sfxFilesToProcess = [];
        allSfx.forEach(sfx => {
            const sfxPath = path.join(sfxDir, `${sfx.type}.wav`);
            if (fs.existsSync(sfxPath)) {
                sfxFilesToProcess.push({ path: sfxPath, time: sfx.time });
            }
        });

        let bgmFileToProcess = null;
        if (fs.existsSync(bgSoundDir)) {
            const files = fs.readdirSync(bgSoundDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
            if (files.length > 0) {
                bgmFileToProcess = path.join(bgSoundDir, files[Math.floor(Math.random() * files.length)]);
            }
        }

        const totalAudioStreams = 1 + (bgmFileToProcess ? 1 : 0) + sfxFilesToProcess.length;
        let amixInputs = '';

        if (bgmFileToProcess) {
            command = command.input(bgmFileToProcess);
            const bgmVol = 0.025 * totalAudioStreams;
            filterComplex.push(`[${inputIndex}:a]volume=${bgmVol.toFixed(2)}[bgm]`);
            amixInputs += '[bgm]';
            inputIndex++;
        }

        let sfxIdx = 0;
        sfxFilesToProcess.forEach(sfx => {
            command = command.input(sfx.path);
            const delayMs = Math.floor(sfx.time * 1000);
            const sfxVol = 0.35 * totalAudioStreams;
            filterComplex.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=${sfxVol.toFixed(2)}[sfx${sfxIdx}]`);
            amixInputs += `[sfx${sfxIdx}]`;
            inputIndex++;
            sfxIdx++;
        });

        if (totalAudioStreams > 1) {
            filterComplex.push(`[0:a]volume=${totalAudioStreams}[main_a]`);
            const finalAmixInputs = `[main_a]${amixInputs}`;
            filterComplex.push(`${finalAmixInputs}amix=inputs=${totalAudioStreams}:duration=first[aout]`);
            command = command.complexFilter(filterComplex).outputOptions([`-map ${voutName}`, '-map [aout]']);
        } else {
            command = command.complexFilter(filterComplex).outputOptions([`-map ${voutName}`, '-map 0:a']);
        }

        command
            .output(outputPath)
            .videoCodec('libx264')
            .addOutputOptions(['-preset ultrafast', '-crf 23'])
            .on('end', () => {
                console.log(`Successfully processed clip ${clip.rank}`);
                if (subPath && fs.existsSync(subPath)) fs.unlinkSync(subPath);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`Error processing clip ${clip.rank}:`, err);
                if (subPath && fs.existsSync(subPath)) fs.unlinkSync(subPath);
                reject(err);
            })
            .run();
    });
};



/**
 * Story Mode: Download multiple segments and concatenate into one video
 */
const processStoryClip = async (url, story, outputPath, fullTranscript) => {
    const segmentPaths = [];

    // 1. Download each segment individually
    console.log(`Story Mode: Downloading ${story.segments.length} segments for "${story.title}"...`);
    for (let i = 0; i < story.segments.length; i++) {
        const seg = story.segments[i];
        console.log(`  Downloading segment ${i + 1} [${seg.label}]: ${seg.start_time}s → ${seg.end_time}s`);
        const segPath = path.join(clipsDir, `story_seg_${Date.now()}_${i}.mp4`);
        await ytDlp(url, {
            f: 'bestvideo[vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
            o: segPath,
            mergeOutputFormat: 'mp4',
            downloadSections: `*${seg.start_time}-${seg.end_time}`,
            forceKeyframesAtCut: true,
        });
        segmentPaths.push({ path: segPath, seg });
    }

    // 2. Build concat filter — stack all segments end to end
    return new Promise((resolve, reject) => {
        let command = ffmpeg();

        // Add all segment files as inputs
        segmentPaths.forEach(({ path: p }) => command = command.input(p));

        const filterComplex = [];
        const totalSegs = segmentPaths.length;

        // Scale + crop each segment to 9:16 portrait then concat
        for (let i = 0; i < totalSegs; i++) {
            filterComplex.push(`[${i}:v]crop=ih*(9/16):ih,setsar=1[v${i}]`);
            filterComplex.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
        }

        const vInputs = Array.from({ length: totalSegs }, (_, i) => `[v${i}]`).join('');
        const aInputs = Array.from({ length: totalSegs }, (_, i) => `[a${i}]`).join('');
        filterComplex.push(`${vInputs}concat=n=${totalSegs}:v=1:a=0[vcat]`);
        filterComplex.push(`${aInputs}concat=n=${totalSegs}:v=0:a=1[acat]`);

        // Subtitles
        let subPath = null;
        let videoOut = '[vcat]';
        if (fullTranscript && story.segments.length > 0) {
            subPath = path.join(clipsDir, `story_subs_${Date.now()}.ass`);
            generateStoryASS(fullTranscript, story.segments, subPath);
            filterComplex.push(`[vcat]subtitles='${subPath}'[vfinal]`);
            videoOut = '[vfinal]';
        }

        // BGM
        const bgSoundDir = path.join(__dirname, '../../bg-sound');
        let bgmInput = null;
        if (fs.existsSync(bgSoundDir)) {
            const files = fs.readdirSync(bgSoundDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
            if (files.length > 0) {
                bgmInput = path.join(bgSoundDir, files[Math.floor(Math.random() * files.length)]);
            }
        }

        let audioOut = '[acat]';
        let bgmIdx = totalSegs;
        if (bgmInput) {
            command = command.input(bgmInput);
            filterComplex.push(`[${bgmIdx}:a]volume=0.06[bgm]`);
            filterComplex.push(`[acat][bgm]amix=inputs=2:duration=first[afinal]`);
            audioOut = '[afinal]';
            bgmIdx++;
        }

        command
            .complexFilter(filterComplex)
            .outputOptions([`-map ${videoOut}`, `-map ${audioOut}`])
            .videoCodec('libx264')
            .addOutputOptions(['-preset ultrafast', '-crf 23'])
            .output(outputPath)
            .on('end', () => {
                console.log(`Story clip rendered: ${outputPath}`);
                if (subPath && fs.existsSync(subPath)) fs.unlinkSync(subPath);
                segmentPaths.forEach(({ path: p }) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`Error rendering story clip:`, err);
                if (subPath && fs.existsSync(subPath)) fs.unlinkSync(subPath);
                segmentPaths.forEach(({ path: p }) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
                reject(err);
            })
            .run();
    });
};

module.exports = {
    downloadVideo,
    downloadVideoSection,
    getTrackingData,
    processClip,
    processStoryClip
};
