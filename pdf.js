// === CONFIGURATION ===
// ▼▼▼ PASTE YOUR AWS API GATEWAY URL HERE ▼▼▼
const API_SERVER_URL = "https://2n57pjdjyfwn2s7m4zjormgwuy0lirsc.lambda-url.eu-north-1.on.aws"; 
const CURRENT_SERVICE = "pdf"; 
// =====================

// UI References
const fileInput = document.getElementById('file-input');
const fileLabel = document.querySelector('.file-label');
const fileNameDisplay = document.getElementById('file-name');
const statusMessage = document.getElementById('status');

// Button Management
const originalButton = document.getElementById('upload-button');
let currentButton = originalButton;

// State
let selectedFiles = [];

// --- 1. SETUP MULTI-FILE SELECTION ---
// We enable multiple file selection programmatically
fileInput.setAttribute('multiple', '');

fileInput.addEventListener('change', () => {
    // Convert the FileList to a standard Array
    selectedFiles = Array.from(fileInput.files);
    
    // Update UI
    if (selectedFiles.length > 0) {
        fileNameDisplay.textContent = `${selectedFiles.length} file(s) selected`;
        fileLabel.textContent = "Change Images";
    } else {
        fileNameDisplay.textContent = "No files selected";
        fileLabel.textContent = "Choose Images";
    }

    // Reset Button Logic
    // If the Download button is showing, swap back to the Original button
    if (currentButton !== originalButton) {
        currentButton.parentNode.replaceChild(originalButton, currentButton);
        currentButton = originalButton;
        setStatus("", "info");
    }
});

// --- 2. MAIN LOGIC ---
originalButton.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        setStatus("Please select at least one image.", "error");
        return;
    }

    try {
        // --- A. GENERATE PDF CLIENT-SIDE ---
        setStatus("Generating PDF in browser...", "info");
        
        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;

        // Loop through every selected file
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            
            // Update status
            setStatus(`Processing image ${i + 1} of ${selectedFiles.length}...`, "info");

            // 1. Read file as Base64 Data
            const imgData = await readFileAsDataURL(file);
            
            // 2. Get Image Properties to calculate aspect ratio
            const imgProps = doc.getImageProperties(imgData);
            
            // Calculate dimensions to fit page while keeping aspect ratio
            const imgRatio = imgProps.width / imgProps.height;
            const printWidth = pageWidth - (margin * 2);
            const printHeight = printWidth / imgRatio;

            // 3. Add a new page (skip for the very first image)
            if (i > 0) doc.addPage();

            // 4. Draw the image onto the PDF
            doc.addImage(imgData, 'JPEG', margin, margin, printWidth, printHeight);
        }

        // --- B. PREPARE UPLOAD ---
        setStatus("Finalizing PDF...", "info");
        
        // Convert the PDF to a Blob (Binary Large Object) for uploading
        const pdfBlob = doc.output('blob');
        
        // Create a name for the final file
        const finalFileName = "merged_documents.pdf";

        // --- C. UPLOAD TO S3 (For Storage/Backup) ---
        setStatus("Backing up to server...", "info");

        // // 1. Get Presigned URL
        // // Note: We use 'pdf' service to put it in the pdf/ folder
        // const urlRes = await fetch(`${API_SERVER_URL}/generate-upload-url?filename=${finalFileName}&service=${CURRENT_SERVICE}`);
        // if (!urlRes.ok) throw new Error("Failed to connect to server");
        // const data = await urlRes.json();

        // // 2. Upload the Blob
        // const upRes = await fetch(data.upload_url, { 
        //     method: 'PUT', 
        //     body: pdfBlob 
        // });
        
        // if (!upRes.ok) throw new Error("Upload failed");

        // --- D. SWAP TO DOWNLOAD BUTTON ---
        setStatus("Success! PDF Ready.", "success");

        // Create the Download Button Clone
        const dlBtn = originalButton.cloneNode(true);
        dlBtn.textContent = "Download PDF";
        dlBtn.style.backgroundColor = "#28a745"; // Green
        dlBtn.classList.add("shake-animation");  // Shake Effect

        // Add Click Listener to Save File
        dlBtn.addEventListener('click', () => {
            // jsPDF has a built-in .save() method!
            doc.save(finalFileName); 
        });

        // Swap the buttons
        originalButton.parentNode.replaceChild(dlBtn, originalButton);
        currentButton = dlBtn;

    } catch (e) {
        console.error(e);
        setStatus("Error: " + e.message, "error");
    }
});

// --- HELPER FUNCTIONS ---

function setStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-${type}`;
}

// Wrapper to read files asynchronously
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}