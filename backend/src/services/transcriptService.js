const { YoutubeTranscript } = require('youtube-transcript');

/**
 * Fetches the transcript for a YouTube video.
 * @param {string} url - YouTube URL or video ID
 * @returns {Promise<Array<{text: string, duration: number, offset: number}>>}
 */
const getTranscript = async (url) => {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        return transcript;
    } catch (error) {
        console.error("Error fetching transcript:", error);
        throw new Error("No captions available for this video.");
    }
};

module.exports = {
    getTranscript
};
