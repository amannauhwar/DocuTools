import json
import boto3
import cv2
import os
import numpy as np
import urllib.parse # <--- NEW: Needed to decode filenames (like "image%20space.jpg")

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    print("Received event: " + json.dumps(event, indent=2)) # Log the event for debugging

    # --- 1. PARSE S3 EVENT (The Fix) ---
    # S3 sends the data inside a wrapper called 'Records'
    try:
        # Get the first record (usually only one file is uploaded at a time)
        record = event['Records'][0]
        
        # Extract the bucket name
        bucket_name = record['s3']['bucket']['name']
        
        # Extract the file name (Key)
        # We must 'unquote' it because S3 turns spaces into %20
        raw_key = record['s3']['object']['key']
        file_key = urllib.parse.unquote_plus(raw_key)
        
    except KeyError:
        # Fallback for manual testing (if you still want the Test button to work)
        if 'bucket_name' in event:
            bucket_name = event['bucket_name']
            file_key = event['file_key']
        else:
            return {"statusCode": 400, "body": "Error: Could not parse S3 event."}

    # --- GUARD CLAUSE: IGNORE PROCESSED FILES ---
    # If the file is in the 'processed/' folder, STOP immediately.
    # This prevents the Infinite Loop if you mess up the trigger settings.
    if "processed/" in file_key:
        print("Skipping processed file to prevent loop.")
        return {"statusCode": 200, "body": "Skipped processed file."}

    # --- GUARD CLAUSE: CHECK EXTENSION ---
    allowed_exts = ('.jpg', '.jpeg', '.png', '.webp')
    if not file_key.lower().endswith(allowed_exts):
        print(f"Skipping {file_key} (Unsupported extension)")
        return {"statusCode": 200, "body": "Skipped unsupported file."}

    # ==========================================================
    # THE REST OF YOUR CODE IS THE SAME...
    # ==========================================================
    
    download_path = f'/tmp/{os.path.basename(file_key)}'
    upload_path = f'/tmp/processed_{os.path.basename(file_key)}'
    
    print(f"Downloading {file_key} from {bucket_name}...")
    try:
        s3_client.download_file(bucket_name, file_key, download_path)
    except Exception as e:
        print(f"Download Error: {str(e)}")
        return {"statusCode": 500, "body": f"Failed to download: {str(e)}"}

    # ... (Paste your OpenCV Watermark Removal Logic here) ...
    # 1. Load Image
    img = cv2.imread(download_path)
    if img is None:
        return {"statusCode": 500, "body": "Error: OpenCV could not read image"}

    # 2. Threshold & Mask (Your updated logic with 180 threshold)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, global_mask = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)
    
    height, width = global_mask.shape
    roi_mask = np.zeros_like(global_mask)
    roi_mask[int(height*0.80):height, 0:width] = 255
    
    final_mask = cv2.bitwise_and(global_mask, roi_mask)
    kernel = np.ones((3,3), np.uint8)
    final_mask = cv2.dilate(final_mask, kernel, iterations=2)
    
    result = cv2.inpaint(img, final_mask, 3, cv2.INPAINT_TELEA)
    
    # 3. Save & Upload
    cv2.imwrite(upload_path, result)
    destination_key = f"processed/{os.path.basename(file_key)}"
    
    s3_client.upload_file(upload_path, bucket_name, destination_key)

    return {
        'statusCode': 200,
        'body': json.dumps(f"Success! Saved to {destination_key}")
    }