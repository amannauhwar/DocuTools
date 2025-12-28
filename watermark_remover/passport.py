# import json

# def lambda_handler(event, context):
#     # TODO implement
#     return {
#         'statusCode': 200,
#         'body': json.dumps('Hello from Lambda!')
#     }

import boto3
import json
import os
from botocore.exceptions import ClientError
import logging

# --- Get Config from Environment Variables ---
UPLOAD_BUCKET_NAME = os.environ.get("UPLOAD_BUCKET_NAME")
DOWNLOAD_BUCKET_NAME = os.environ.get("DOWNLOAD_BUCKET_NAME")
FRONTEND_URL = os.environ.get("FRONTEND_URL")

# --- Boto3 Client ---
s3_client = boto3.client("s3")
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    This function handles all API requests.
    It routes traffic based on the path.
    """
    logger.info(f"Received event: {event}")
    
    # Get the API path from the event
    try:
        path = event['requestContext']['http']['path']
    except KeyError:
        return create_response(500, {'error': 'Cannot determine request path'})

    # --- ROUTER ---
    # Route the request to the correct function based on the path
    if path == '/generate-upload-url':
        return handle_get_upload_url(event)
    elif path == '/check-download-url':
        return handle_check_download_url(event)
    else:
        return create_response(404, {'error': 'Not Found'})

# --- Function 1: Handle Upload URL ---
def handle_get_upload_url(event):
    try:
        file_name = event['queryStringParameters']['filename']
    except (KeyError, TypeError):
        return create_response(400, {'error': 'filename query parameter is required'})

    logger.info(f"Generating UPLOAD URL for: {file_name}")
    try:
        upload_url = s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": UPLOAD_BUCKET_NAME, "Key": file_name},
            ExpiresIn=100
        )
        return create_response(200, {"upload_url": upload_url})
    
    except ClientError as e:
        logger.error(e)
        return create_response(500, {"error": "Couldn't generate upload URL"})

# --- Function 2: Handle Polling for Download URL ---
def handle_check_download_url(event):
    try:
        file_name = event['queryStringParameters']['filename']
    except (KeyError, TypeError):
        return create_response(400, {'error': 'filename query parameter is required'})

    try:
        # Check if the file exists using head_object
        s3_client.head_object(Bucket=DOWNLOAD_BUCKET_NAME, Key=file_name)
        
        # If it exists, generate the download URL
        logger.info(f"File found: {file_name}. Generating download URL.")
        download_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",                               
            Params={"Bucket": DOWNLOAD_BUCKET_NAME, "Key": file_name},
            ExpiresIn=50
        )
        return create_response(200, {
            "status": "ready",
            "download_url": download_url
        })

    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            logger.info(f"File not ready yet: {file_name}")
            return create_response(200, {"status": "processing"})
        
        logger.error(e)
        return create_response(500, {"error": "Error checking file status"})

# --- Helper Function to Create All Responses ---
def create_response(status_code, body_object):
    """
    Helper to format the JSON response with CORS headers.
    """
    return {
        'statusCode': status_code,
        # 'headers': {
        #     'Access-Control-Allow-Origin': FRONTEND_URL,
        #     'Access-Control-Allow-Methods': 'GET, OPTIONS'
        # },
        'body': json.dumps(body_object)
    }