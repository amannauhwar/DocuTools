import boto3
import json
import os
import uuid
from botocore.exceptions import ClientError
import logging

# --- Config ---
UPLOAD_BUCKET_NAME = os.environ.get("UPLOAD_BUCKET_NAME")
DOWNLOAD_BUCKET_NAME = os.environ.get("DOWNLOAD_BUCKET_NAME")

s3_client = boto3.client("s3")
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    
    # --- 1. GET PATH (Function URL Style) ---
    # Function URLs usually put the path in 'rawPath'
    path = event.get('rawPath')
    
    # Fallback if rawPath is missing
    if not path and 'requestContext' in event:
        path = event['requestContext'].get('http', {}).get('path')

    if not path:
        return create_response(500, {'error': 'Cannot determine path'})

    # --- 2. ROUTER ---
    # Handle the routing based on the path
    if path == '/generate-upload-url':
        return handle_get_upload_url(event)
    elif path == '/check-download-url':
        return handle_check_download_url(event)
    else:
        return create_response(404, {'error': f'Path {path} not found'})

# --- Function 1: Handle Upload URL ---
def handle_get_upload_url(event):
    # Safe parameter extraction
    params = event.get('queryStringParameters') or {}
    original_name = params.get('filename')
    file_type = params.get('fileType', 'application/octet-stream')

    if not original_name:
        return create_response(400, {'error': 'filename is required'})

    # Generate UUID for security
    ext = original_name.split('.')[-1]
    new_filename = f"{uuid.uuid4()}.{ext}"
    object_key = f"uploads/{new_filename}"

    try:
        upload_url = s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": UPLOAD_BUCKET_NAME, 
                "Key": object_key,
                "ContentType": file_type
            },
            ExpiresIn=300
        )
        
        return create_response(200, {
            "upload_url": upload_url,
            "file_key": object_key 
        })
    
    except ClientError as e:
        logger.error(e)
        return create_response(500, {"error": "Server Error"})

# --- Function 2: Handle Polling ---
def handle_check_download_url(event):
    params = event.get('queryStringParameters') or {}
    input_key = params.get('filename') # This is the "uploads/..." key
    
    if not input_key:
        return create_response(400, {'error': 'filename is required'})

    # Convert "uploads/abc.jpg" -> "processed/abc.jpg"
    # Make sure this matches your Watermark Lambda logic exactly!
    clean_filename = f"processed/{os.path.basename(input_key)}"

    try:
        s3_client.head_object(Bucket=DOWNLOAD_BUCKET_NAME, Key=clean_filename)
        
        download_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",                               
            Params={"Bucket": DOWNLOAD_BUCKET_NAME, "Key": clean_filename},
            ExpiresIn=300
        )
        return create_response(200, {
            "status": "ready",
            "download_url": download_url
        })

    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            return create_response(200, {"status": "processing"})
        logger.error(e)
        return create_response(500, {"error": "Error checking status"})

# --- Helper: No CORS Headers Here! ---
def create_response(status_code, body_object):
    return {
        'statusCode': status_code,
        # 'headers': { ... }  <-- DELETED! AWS adds these for you now.
        'body': json.dumps(body_object)
    }