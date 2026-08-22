# PDF Sharing Through WAHA - Complete Implementation Guide

## Overview

This guide explains how to share PDF files with WhatsApp contacts through the WAHA (WhatsApp HTTP API) integration in the Buildesk platform. The system supports sending PDFs and other document types as attachments via WhatsApp messages.

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/Vite)                    │
│  - ChatInterface: Message composer with file upload         │
│  - TemplateLabModal: Template creation with PDF attachment  │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTP POST /api/send-media
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Flask API)                       │
│  - /api/send-media: Receives file, encodes to base64        │
│  - Message DB: Stores PDF share history                     │
│  - Session Management: User-specific WAHA sessions          │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTP POST /api/sendFile (with X-Api-Key)
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              WAHA Service (WhatsApp HTTP API)                │
│  - Manages WhatsApp Web sessions                            │
│  - Converts base64 file to WhatsApp-compatible format       │
│  - Handles delivery through WhatsApp servers                │
└────────────────┬────────────────────────────────────────────┘
                 │ Binary Protocol
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              WhatsApp Servers / Recipient Device            │
│  - Receives and stores PDF file                             │
│  - Displays in WhatsApp chat thread                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Transport** | WAHA (WhatsApp HTTP API) | Bridge between Buildesk and WhatsApp |
| **Encoding** | Base64 | Convert binary PDF to transferable format |
| **Storage** | SQLite (Message table) | Track PDF shares in conversation history |
| **API Protocol** | RESTful JSON | Communication between backend and WAHA |
| **Frontend** | React + TypeScript | User interface for PDF selection |
| **Backend** | Flask (Python) | Core logic, file processing, WAHA orchestration |

---

## Backend Implementation

### 1. Environment Variables

Configure these variables in `.env` or `docker-compose.yml`:

```bash
# WAHA Service Configuration
WAHA_API=http://waha:3000          # WAHA service endpoint
WAHA_KEY=your_waha_api_key         # API key for WAHA authentication
WAHA_SESSION_NAME=default           # Default WhatsApp session (can override per user)

# Server Configuration
FLASK_ENV=production                # Development or production
SECRET_KEY=your_secret_key          # Flask session secret
```

### 2. API Endpoint: `/api/send-media`

**Route Definition:**
```python
@app.route('/api/send-media', methods=['POST'])
@login_required
def send_media():
    """Send image, document, or audio attachment via WAHA."""
```

**Request Format:**
```
Method: POST
Content-Type: multipart/form-data

Parameters:
  - to (string, required): Phone number with country code (e.g., "919876543210")
  - message (string, optional): Caption/description for the file
  - file (file, required): PDF or document file to send
```

**Request Example (cURL):**
```bash
curl -X POST http://localhost:5000/api/send-media \
  -H "Cookie: session=your_session_cookie" \
  -F "to=919876543210" \
  -F "message=Here is the contract PDF" \
  -F "file=@/path/to/document.pdf"
```

### 3. Processing Pipeline

#### Step 1: Validation
```python
phone = sanitize_phone(request.form.get('to', ''))
caption = (request.form.get('message') or '').strip()

if not phone:
    return error("Missing 'to' (phone)")
if not file or file.filename == '':
    return error("Missing file")
```

#### Step 2: File Encoding
```python
file_data = file.read()
b64 = base64.b64encode(file_data).decode('utf-8')
mimetype = file.content_type or 'application/octet-stream'
filename = file.filename or 'attachment'
```

**Why Base64?**
- WhatsApp API requires binary data in text-safe format
- Base64 ensures no data corruption during transmission
- Supported across all platforms (web, mobile, API)

#### Step 3: WAHA Payload Construction
```python
payload = {
    "session": session_name,              # User's WhatsApp session
    "chatId": f"{phone}@c.us",           # WhatsApp chat ID format
    "file": {
        "mimetype": mimetype,             # e.g., "application/pdf"
        "filename": filename,             # Displayed name in WhatsApp
        "data": b64                       # Base64-encoded file content
    },
    "caption": caption or ""              # Optional message text
}
```

#### Step 4: Endpoint Selection
```python
if mimetype.startswith('image/'):
    endpoint = f"{WAHA_API}/api/sendImage"    # For PNG, JPG, etc.
elif mimetype.startswith('audio/'):
    endpoint = f"{WAHA_API}/api/sendVoice"    # For MP3, OGG, etc.
else:
    endpoint = f"{WAHA_API}/api/sendFile"     # For PDF, DOCX, etc.
```

#### Step 5: WAHA Transmission
```python
headers = {
    "X-Api-Key": WAHA_KEY,
    "Content-Type": "application/json"
}

response = requests.post(
    endpoint,
    json=payload,
    headers=headers,
    timeout=30
)

if response.status_code not in (200, 201):
    return error(f"WAHA rejected: {response.text}")
```

#### Step 6: Message History Recording
```python
display_content = caption or f"📎 Document: {filename}"
msg = Message(
    phone=phone,
    content=display_content,
    is_from_me=True,
    user_id=current_user.id
)
db.session.add(msg)
db.session.commit()
```

### 4. Database Schema

**Message Table:**
```sql
CREATE TABLE message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone VARCHAR(20) NOT NULL,
    content TEXT,
    is_from_me BOOLEAN DEFAULT 0,
    user_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id)
);
```

**What's Stored:**
- `phone`: Recipient's phone number
- `content`: File description/caption (e.g., "📎 Document: contract.pdf")
- `is_from_me`: True (indicates user sent it)
- `timestamp`: When PDF was shared
- `user_id`: Which user/admin sent it

### 5. Error Handling

**Common Errors & Solutions:**

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Not logged in | Login first, check session cookie |
| `400 Missing 'to' (phone)` | Phone number empty/invalid | Provide valid 10-15 digit phone |
| `400 Missing file` | No file attached | Include file in form data |
| `500 WAHA rejected media` | WAHA service down or API key invalid | Check WAHA service, verify `WAHA_KEY` |
| `500 File too large` | Exceeds WAHA limits (~100MB) | Send smaller files, compress if needed |
| `500 Timeout` | Network delay | Increase timeout or retry |

**Implementation:**
```python
try:
    # Process and send
    r = requests.post(endpoint, json=payload, headers=headers, timeout=30)
    if r.status_code not in (200, 201):
        return jsonify({"status": "error", "message": r.text or "WAHA rejected media"}), 400
except requests.Timeout:
    return jsonify({"status": "error", "message": "Request timeout"}), 500
except Exception as e:
    return jsonify({"status": "error", "message": str(e)}), 500
```

---

## Frontend Implementation

### 1. File Upload Component

**Location:** `src/components/ChatInterface.tsx`

**HTML Structure:**
```jsx
<input
  type="file"
  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.png,.mp3,.m4a"
  onChange={handleFileSelect}
  ref={fileInputRef}
/>
```

### 2. File Selection Handler

```typescript
const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.currentTarget.files?.[0];
  if (!file) return;

  // Validate file size (max 100MB for WAHA)
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxSize) {
    alert(`File too large. Maximum size: 100MB`);
    return;
  }

  // Show file info
  setSelectedFile(file);
  setSelectedFileName(file.name);
};
```

### 3. Send PDF Function

```typescript
const sendPDF = async () => {
  if (!selectedFile || !selectedPhone) {
    alert("Select contact and file");
    return;
  }

  const formData = new FormData();
  formData.append("to", selectedPhone);
  formData.append("message", messageCaption || "");
  formData.append("file", selectedFile);

  try {
    setLoading(true);
    const response = await fetch("/api/send-media", {
      method: "POST",
      body: formData,
      credentials: "include" // Send session cookie
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to send PDF");
    }

    const result = await response.json();
    alert("PDF sent successfully!");
    setSelectedFile(null);
    setSelectedFileName("");
    refreshConversation();

  } catch (error) {
    console.error("Send error:", error);
    alert(`Error: ${error.message}`);
  } finally {
    setLoading(false);
  }
};
```

### 4. UI Integration

**Add file upload button to chat interface:**
```jsx
<div className="chat-input-area">
  <input
    type="text"
    placeholder="Type message..."
    value={message}
    onChange={(e) => setMessage(e.target.value)}
  />
  
  {/* File upload button */}
  <button onClick={() => fileInputRef.current?.click()}>
    📎 Attach File
  </button>
  {selectedFileName && (
    <span className="file-name">{selectedFileName}</span>
  )}
  
  <button onClick={sendPDF} disabled={loading}>
    {loading ? "Sending..." : "Send"}
  </button>
  
  <input
    type="file"
    ref={fileInputRef}
    onChange={handleFileSelect}
    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.png,.mp3,.m4a"
    style={{ display: "none" }}
  />
</div>
```

---

## Usage Workflow

### Step 1: Initiate PDF Share
1. User selects a contact from the contact list
2. Chat interface opens for that contact
3. User clicks **📎 Attach File** button

### Step 2: Select PDF
1. File picker dialog opens
2. User navigates to PDF file location
3. User selects file (e.g., "contract.pdf")
4. File name displays in the UI

### Step 3: Add Optional Caption
```
Message field: "Here is the signed contract for review"
```

### Step 4: Send
1. User clicks **Send** button
2. File is uploaded to backend via `/api/send-media`
3. Backend encodes file to Base64
4. Payload sent to WAHA
5. WAHA transmits to WhatsApp
6. Recipient receives PDF in chat

### Step 5: Confirmation
- Message appears in local chat history
- UI shows: `📎 Document: contract.pdf` (if no caption)
- Backend stores event in SQLite
- User can see in `/api/conversation/<phone>` history

---

## Configuration Examples

### Example 1: Send Invoice PDF

**Request:**
```bash
curl -X POST http://localhost:5000/api/send-media \
  -H "Cookie: session=abc123" \
  -F "to=919876543210" \
  -F "message=Invoice #INV-2026-001 for January services" \
  -F "file=@invoices/INV-2026-001.pdf"
```

**WhatsApp Result:**
```
Message appears as:
[Attachment: Document]
Invoice #INV-2026-001 for January services

(recipient can click to download/view)
```

### Example 2: Send Contract Without Caption

**Request:**
```bash
curl -X POST http://localhost:5000/api/send-media \
  -F "to=919876543210" \
  -F "file=@/tmp/service_agreement.pdf"
```

**WhatsApp Result:**
```
[Attachment: Document]
📎 Document: service_agreement.pdf
```

### Example 3: Send Image with Message

**Request:**
```bash
curl -X POST http://localhost:5000/api/send-media \
  -F "to=919876543210" \
  -F "message=Proof of payment" \
  -F "file=@receipts/payment_receipt.jpg"
```

**Backend Behavior:**
- Detects `mimetype=image/jpeg`
- Routes to `/api/sendImage` (not `/api/sendFile`)
- Sends as image message with caption

---

## Advanced Features

### 1. Batch PDF Sending

**Scenario:** Send same PDF to multiple contacts

**Implementation:**
```python
def send_pdf_batch(pdf_file, phone_list, caption=""):
    results = []
    for phone in phone_list:
        try:
            # Call send_media for each phone
            # (reuse the existing endpoint)
            result = send_to_waha(pdf_file, phone, caption)
            results.append({"phone": phone, "status": "success"})
        except Exception as e:
            results.append({"phone": phone, "status": "failed", "error": str(e)})
    return results
```

**Frontend:**
```typescript
const sendPDFBatch = async (pdfFile: File, phones: string[]) => {
  for (const phone of phones) {
    const formData = new FormData();
    formData.append("to", phone);
    formData.append("message", batchCaption);
    formData.append("file", pdfFile);

    try {
      await fetch("/api/send-media", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
    } catch (error) {
      console.error(`Failed for ${phone}:`, error);
    }
  }
};
```

### 2. Scheduled PDF Sends

**Scenario:** Schedule PDF delivery for later

**Implementation:**
```python
@app.route('/api/schedule-pdf-send', methods=['POST'])
@login_required
def schedule_pdf_send():
    phone = request.form.get('to')
    send_time = request.form.get('send_at')  # ISO timestamp
    caption = request.form.get('message')
    file = request.files.get('file')

    # Create ScheduledMessage with file reference
    scheduled = ScheduledMessage(
        phone=phone,
        template_id=None,
        content=caption,
        send_at=parse_iso(send_time),
        user_id=current_user.id,
        is_file=True,
        file_name=file.filename,
        file_data=base64.b64encode(file.read()).decode()
    )
    db.session.add(scheduled)
    db.session.commit()
    
    return jsonify({"status": "scheduled", "id": scheduled.id})
```

### 3. PDF Template Library

**Scenario:** Pre-built PDF templates for quick sharing

**Implementation:**
```python
@app.route('/api/pdf-templates', methods=['GET'])
@login_required
def get_pdf_templates():
    templates = {
        "invoice": "/static/templates/invoice.pdf",
        "contract": "/static/templates/service_agreement.pdf",
        "quote": "/static/templates/quote_template.pdf",
        "receipt": "/static/templates/receipt.pdf"
    }
    return jsonify(templates)
```

---

## Performance Optimization

### 1. File Size Management

```python
def validate_file_size(file, max_mb=100):
    """Ensure file doesn't exceed WAHA limits."""
    file.seek(0, 2)  # Seek to end
    size = file.tell()
    file.seek(0)     # Reset to start
    
    if size > max_mb * 1024 * 1024:
        raise ValueError(f"File exceeds {max_mb}MB limit")
    return True
```

### 2. Base64 Chunking (for large files)

```python
def stream_large_file(file_path, chunk_size=1024*1024):
    """Stream large files in chunks to avoid memory exhaustion."""
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            yield base64.b64encode(chunk)
```

### 3. Caching Frequently Sent PDFs

```python
from functools import lru_cache

@lru_cache(maxsize=10)
def get_cached_pdf(filename):
    """Cache base64 of frequently-sent PDFs."""
    with open(f"templates/{filename}", 'rb') as f:
        return base64.b64encode(f.read()).decode()
```

---

## Security Considerations

### 1. File Validation

```python
ALLOWED_EXTENSIONS = {
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt',
    'jpg', 'jpeg', 'png', 'gif',
    'mp3', 'm4a', 'ogg', 'wav'
}

def validate_file_extension(filename):
    ext = filename.rsplit('.', 1)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type .{ext} not allowed")
```

### 2. MIME Type Verification

```python
import magic  # pip install python-magic

def verify_mime_type(file_data, expected_mime):
    """Prevent file type spoofing."""
    actual_mime = magic.from_buffer(file_data, mime=True)
    if not actual_mime.startswith(expected_mime.split('/')[0]):
        raise ValueError("File MIME type mismatch")
```

### 3. Quarantine Suspicious Files

```python
def scan_with_virus_engine(file_data):
    """Optional: integrate with VirusTotal/ClamAV for security."""
    # Pseudo-code
    result = requests.post(
        "https://www.virustotal.com/api/v3/files",
        files={"file": file_data},
        headers={"x-apikey": VIRUSTOTAL_KEY}
    )
    return result.json()
```

---

## Troubleshooting

### Issue: "WAHA rejected media"

**Causes:**
1. WAHA service is down
2. Invalid API key
3. WhatsApp session not authenticated

**Solution:**
```bash
# Check WAHA service status
curl http://localhost:3000/api/status -H "X-Api-Key: YOUR_KEY"

# Expected response:
# {"status": "running", "version": "0.x.x"}
```

### Issue: File doesn't appear in WhatsApp

**Causes:**
1. Network connectivity issue
2. Recipient phone offline
3. File format not supported by WhatsApp

**Solution:**
```python
# Log WAHA response for debugging
r = requests.post(endpoint, json=payload, headers=headers)
print(f"Status: {r.status_code}")
print(f"Response: {r.text}")
print(f"Headers: {r.headers}")
```

### Issue: Large files timeout

**Causes:**
1. File > 100MB
2. Network bandwidth limited
3. WAHA timeout too short

**Solution:**
```python
# Increase timeout for large files
if file_size > 50 * 1024 * 1024:  # > 50MB
    timeout = 60  # 60 seconds
else:
    timeout = 30

requests.post(endpoint, json=payload, headers=headers, timeout=timeout)
```

---

## API Response Examples

### Success Response
```json
{
  "status": "success",
  "message": "PDF sent successfully",
  "data": {
    "phone": "919876543210",
    "message_id": "12345",
    "timestamp": "2026-05-17T10:59:03Z",
    "file": "contract.pdf"
  }
}
```

### Error Response
```json
{
  "status": "error",
  "message": "File too large. Maximum size: 100MB"
}
```

---

## Integration with Existing Features

### 1. With Message Templates

**Combine PDF with template text:**
```python
# Get template
template = Template.query.get(template_id)

# Add PDF attachment
response = send_media(
    phone=recipient_phone,
    caption=template.body,  # Use template as caption
    file=pdf_file
)
```

### 2. With Scheduled Messages

**Extend ScheduledMessage model:**
```python
class ScheduledMessage(db.Model):
    # ... existing fields ...
    has_attachment = db.Column(db.Boolean, default=False)
    attachment_filename = db.Column(db.String(255))
    attachment_data = db.Column(db.LargeBinary)  # Store file data
    attachment_mime = db.Column(db.String(50))
```

### 3. With AI Assistant

**Generate and send PDFs automatically:**
```python
@app.route('/api/ai-generate-pdf', methods=['POST'])
@login_required
def ai_generate_pdf():
    """Use n8n to generate PDF, then send via WAHA."""
    prompt = request.json.get('prompt')
    phone = request.json.get('phone')

    # Call n8n to generate PDF
    pdf_bytes = call_n8n_generate_pdf(prompt)

    # Send via WAHA
    b64_pdf = base64.b64encode(pdf_bytes).decode()
    
    send_to_waha(
        phone=phone,
        file_data=b64_pdf,
        mimetype='application/pdf',
        filename=f"generated_{int(time.time())}.pdf"
    )

    return jsonify({"status": "success"})
```

---

## Testing Checklist

- [ ] Test with small PDF (<1MB)
- [ ] Test with large PDF (50MB+)
- [ ] Test with different file types (DOC, XLS, JPG, MP3)
- [ ] Test with special characters in filename
- [ ] Test with long caption text (>2000 chars)
- [ ] Test with invalid phone number
- [ ] Test when WAHA is offline
- [ ] Test with invalid API key
- [ ] Test message appears in chat history
- [ ] Test recipient receives file properly
- [ ] Test concurrent sends to multiple contacts
- [ ] Test file download on recipient device
- [ ] Test with slow network (simulate lag)
- [ ] Test file deletion doesn't break history
- [ ] Test with various contact formats

---

## Deployment Notes

### Docker Deployment

**docker-compose.yml:**
```yaml
services:
  buildesk-backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      WAHA_API: http://waha:3000
      WAHA_KEY: ${WAHA_API_KEY}
      FLASK_ENV: production
    volumes:
      - ./backend/instance:/app/instance  # SQLite persistence
    depends_on:
      - waha

  waha:
    image: devlikeapro/waha:latest
    ports:
      - "3000:3000"
    environment:
      WAHA_API_KEY: ${WAHA_API_KEY}
```

### Environment Setup
```bash
# .env file
WAHA_API_KEY=your_secure_api_key_here
FLASK_ENV=production
SECRET_KEY=your_flask_secret_key
```

---

## References

- **WAHA Documentation:** https://waha.dev
- **WhatsApp File Type Limits:** https://faq.whatsapp.com/general/26000007
- **Flask File Upload:** https://flask.palletsprojects.com/en/2.3.x/patterns/fileuploads/
- **Base64 Encoding:** https://www.rfc-editor.org/rfc/rfc4648

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-17 | Initial PDF sharing implementation |
| 1.1 | TBD | Add batch scheduling support |
| 1.2 | TBD | Add virus scanning integration |
| 1.3 | TBD | Add PDF generation from templates |

---

## Support & Questions

For issues or questions about PDF sharing:

1. Check the **Troubleshooting** section above
2. Review WAHA logs: `docker logs buildesk-waha`
3. Check backend logs: `docker logs buildesk-backend`
4. Verify WAHA is running: `curl http://localhost:3000/api/status`
5. Test API directly with provided cURL examples

---

**Last Updated:** May 17, 2026  
**Maintained By:** Buildesk Development Team
