from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import cv2
from ultralytics import YOLO
import tempfile
import os

app = FastAPI()

# Load model globally to avoid reloading on each request
model = YOLO('yolov8n.pt')

@app.post("/analyze-video")
async def analyze_video(file: UploadFile = File(...)):
    # Save the uploaded video to a temporary file
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
            temp_video.write(await file.read())
            temp_video_path = temp_video.name
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    # Open video
    cap = cv2.VideoCapture(temp_video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30 # fallback

    boxes = []
    unique_objects = []
    seen_objects = set()
    frame_count = 0
    
    # Process 1 frame per second to be fast
    frame_skip = int(fps) 
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        if frame_count % frame_skip == 0:
            # Run YOLO inference
            results = model(frame, verbose=False)
            
            person_boxes = []
            timestamp = frame_count / fps
            
            for result in results:
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    if cls_id == 0: # 0 is 'person'
                        person_boxes.append({
                            "x1": float(box.xyxy[0][0]),
                            "y1": float(box.xyxy[0][1]),
                            "x2": float(box.xyxy[0][2]),
                            "y2": float(box.xyxy[0][3]),
                            "conf": conf
                        })
                    elif conf > 0.6:
                        # Non-person objects
                        obj_name = model.names[cls_id]
                        if obj_name not in seen_objects:
                            seen_objects.add(obj_name)
                            unique_objects.append({
                                "name": obj_name,
                                "timestamp": timestamp
                            })
            
            if person_boxes:
                # Take the most confident person box
                best_box = max(person_boxes, key=lambda b: b["conf"])
                
                # Calculate center
                center_x = (best_box["x1"] + best_box["x2"]) / 2
                
                # Get video width/height
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                
                boxes.append({
                    "time": timestamp,
                    "center_x_ratio": center_x / width,
                    "box": best_box
                })
        
        frame_count += 1

    cap.release()
    os.remove(temp_video_path)
    
    return {"status": "success", "data": boxes, "unique_objects": unique_objects}
