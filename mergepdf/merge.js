// Imports from the CDN library
const { PDFDocument } = PDFLib;

// UI References
const fileInput = document.getElementById('file-input');
const fileLabel = document.querySelector('.file-label');
const fileNameDisplay = document.getElementById('file-name');
const actionButton = document.getElementById('action-button');
const statusMessage = document.getElementById('status');

// State
let selectedFiles = [];

// --- 1. FILE SELECTION ---
fileInput.addEventListener('change', () => {
    selectedFiles = Array.from(fileInput.files);
    
    if (selectedFiles.length > 0) {
        fileNameDisplay.textContent = `${selectedFiles.length} PDFs selected`;
        fileLabel.textContent = "Change Selection";
    } else {
        fileNameDisplay.textContent = "No files selected";
        fileLabel.textContent = "Choose PDFs";
    }
    
    // Reset button text
    actionButton.textContent = "Merge PDFs";
    actionButton.style.backgroundColor = "#333";
});

function setStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-${type}`;
}

// Helper to read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// --- 2. MERGE LOGIC ---
actionButton.addEventListener('click', async () => {
    if (selectedFiles.length < 2) {
        setStatus("Please select at least 2 PDF files.", "error");
        return;
    }

    setStatus("Merging documents...", "info");

    try {
        // Create a new, empty PDF
        const mergedPdf = await PDFDocument.create();

        // Loop through each file
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            setStatus(`Processing file ${i + 1} of ${selectedFiles.length}...`, "info");

            // 1. Read the file from disk
            const fileBuffer = await readFileAsArrayBuffer(file);

            // 2. Load it into pdf-lib
            const pdf = await PDFDocument.load(fileBuffer);

            // 3. Copy all pages from this PDF
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());

            // 4. Add them to our new merged PDF
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        setStatus("Finalizing...", "info");

        // --- 3. SAVE AND DOWNLOAD ---
        // Save the new PDF as a Blob (Binary Large Object)
        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        
        // Create download link
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = "merged_document.pdf";
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setStatus("Success! Download started.", "success");
        actionButton.textContent = "Merge Again";
        actionButton.style.backgroundColor = "#28a745";

    } catch (error) {
        console.error(error);
        setStatus("Error: " + error.message, "error");
    }
});