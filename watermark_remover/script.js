// === CONFIGURATION ===
// Replace this with your actual Function URL
const API_SERVER_URL = "https://7trci5rxq6rjab3falry5xovra0gvumr.lambda-url.eu-north-1.on.aws"; 
const POLLING_INTERVAL = 2000; // Check every 2 seconds
const MAX_POLLS = 30; // Stop after 60 seconds
// =====================

// UI References
const mainContainer = document.querySelector('main');
const fileInput = document.getElementById('file-input');
const fileLabel = document.querySelector('.file-label');
const fileNameDisplay = document.getElementById('file-name');
const statusMessage = document.getElementById('status');
const originalUploadButton = document.getElementById('upload-button');

// State Tracking
let currentButton = originalUploadButton;
let selectedFile = null;

// Helper: Update Status Text
function setStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-${type}`;
}

// Helper: Wait function for polling
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- 1. FILE SELECTION & HEIC CONVERSION ---
fileInput.addEventListener('change', async () => {
    // Reset status if user picks a new file
    setStatus("", "info");
    
    if (fileInput.files.length > 0) {
        const rawFile = fileInput.files[0];
        
        // CHECK FOR HEIC (iPhone Format)
        if (rawFile.name.toLowerCase().endsWith('.heic') || rawFile.type === "image/heic") {
            setStatus("Converting iPhone format (HEIC) to JPG... Please wait.", "info");
            
            // Disable button while converting
            originalUploadButton.disabled = true;
            originalUploadButton.style.opacity = "0.5";

            try {
                // Convert Blob
                const convertedBlob = await heic2any({
                    blob: rawFile,
                    toType: "image/jpeg",
                    quality: 0.8
                });

                // Create a new File object (renamed to .jpg)
                const newName = rawFile.name.replace(/\.heic$/i, ".jpg");
                selectedFile = new File([convertedBlob], newName, {
                    type: "image/jpeg"
                });

                setStatus("Conversion complete! Ready to upload.", "success");

            } catch (error) {
                console.error(error);
                setStatus("Error: Could not convert HEIC file.", "error");
                return;
            } finally {
                // Re-enable button
                originalUploadButton.disabled = false;
                originalUploadButton.style.opacity = "1";
            }

        } else {
            // Standard Image (JPG/PNG) - No conversion needed
            selectedFile = rawFile;
        }
        
        // Update UI Text
        fileNameDisplay.textContent = selectedFile.name;
        fileLabel.textContent = "Change File";

        // If "Download" button is showing, swap back to "Upload"
        if (currentButton !== originalUploadButton && mainContainer.contains(currentButton)) {
            mainContainer.replaceChild(originalUploadButton, currentButton);
            currentButton = originalUploadButton;
        }
    }
});

// --- 2. POLLING FUNCTION ---
async function pollForDownload(fileKey) {
    let polls = MAX_POLLS;
    while (polls > 0) {
        try {
            const response = await fetch(`${API_SERVER_URL}/check-download-url?filename=${fileKey}`);
            const data = await response.json();
            
            if (data.status === "ready") {
                return data.download_url;
            }
            
            polls--;
            // Update status with countdown
            setStatus(`Processing image... (${polls} checks left)`, "info");
            await wait(POLLING_INTERVAL);
        } catch (error) {
            console.error("Polling error:", error);
            polls--; 
            await wait(POLLING_INTERVAL);
        }
    }
    throw new Error("Processing timed out. Please try again.");
}

// --- 3. UPLOAD LOGIC ---
originalUploadButton.addEventListener('click', async () => {
    if (!selectedFile) {
        setStatus("Please select a file first.", "error");
        return;
    }

    setStatus("Starting upload...", "info");

    try {
        // A. GET FILE TYPE (Crucial for Strict Mode)
        // If it's empty, default to jpeg, otherwise use the real type (e.g. image/png)
        const fileType = selectedFile.type || 'image/jpeg';
        
        // B. GET PRESIGNED URL
        const response = await fetch(`${API_SERVER_URL}/generate-upload-url?filename=${selectedFile.name}&fileType=${fileType}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to get upload URL');
        }
        
        const data = await response.json();
        const uploadUrl = data.upload_url;
        const fileKey = data.file_key; // Keep the UUID key for polling

        // C. UPLOAD TO S3
        setStatus("Uploading to S3...", "info");
        
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': fileType // ★ MUST MATCH Step B ★
            },
            body: selectedFile
        });
        
        if (!uploadResponse.ok) {
            throw new Error('S3 rejected the upload. Signature Mismatch?');
        }
        
        // D. POLL FOR PROCESSED FILE
        setStatus("Processing image...", "info");
        const downloadUrl = await pollForDownload(fileKey);

        // --- E. SUCCESS: SHOW DOWNLOAD BUTTON ---
        setStatus("Done! Click Download below.", "success");
        
        // Create invisible link
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `cleaned_${selectedFile.name}`; 

        // Create Download Button
        const downloadButton = originalUploadButton.cloneNode(true);
        downloadButton.textContent = "Download Result";
        downloadButton.style.backgroundColor = "#28a745"; // Green
        downloadButton.style.cursor = "pointer";
        downloadButton.classList.add('shake-animation'); // Add shake effect
        
        // Click Handler
        downloadButton.addEventListener('click', () => {
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        // Swap buttons
        if (mainContainer.contains(currentButton)) {
            mainContainer.replaceChild(downloadButton, currentButton);
            currentButton = downloadButton;
        }

    } catch (error) {
        console.error("Full Process Error:", error);
        setStatus(`Error: ${error.message}`, "error");
    }
});