/**
 * Groups transcript items into overlapping time windows.
 * @param {Array} transcript - Array of {text, duration, offset}
 * @param {number} windowSize - Window size in seconds (e.g., 90)
 * @param {number} overlap - Overlap size in seconds (e.g., 30)
 * @returns {Array} - Array of chunks {chunk_id, start_time, end_time, text}
 */
const chunkTranscript = (transcript, windowSize = 90, overlap = 30) => {
    if (!transcript || transcript.length === 0) return [];

    const chunks = [];
    const stepSize = windowSize - overlap; // e.g., 60 seconds
    
    // Determine the total duration of the video based on the last transcript item
    const lastItem = transcript[transcript.length - 1];
    const totalDuration = (lastItem.offset / 1000) + (lastItem.duration / 1000);
    
    let chunkId = 0;
    
    for (let currentStart = 0; currentStart < totalDuration; currentStart += stepSize) {
        const currentEnd = currentStart + windowSize;
        
        // Find all transcript items that fall within this window
        // An item is included if it starts before the window ends AND ends after the window starts
        const itemsInWindow = transcript.filter(item => {
            const itemStart = item.offset / 1000;
            const itemEnd = itemStart + (item.duration / 1000);
            return itemStart < currentEnd && itemEnd > currentStart;
        });

        if (itemsInWindow.length > 0) {
            const text = itemsInWindow.map(item => item.text.replace(/\n/g, ' ')).join(' ');
            
            chunks.push({
                chunk_id: chunkId++,
                start_time: currentStart,
                end_time: currentEnd,
                text: text
            });
        }
    }

    return chunks;
};

module.exports = {
    chunkTranscript
};
