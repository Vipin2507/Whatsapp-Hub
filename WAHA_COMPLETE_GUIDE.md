# WAHA (WhatsApp HTTP API) - Complete Hands-On Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Initial Setup & Installation](#initial-setup--installation)
4. [Configuration & Credentials](#configuration--credentials)
5. [WAHA Dashboard & Session Management](#waha-dashboard--session-management)
6. [API Routes & Endpoints](#api-routes--endpoints)
7. [Complete Workflow](#complete-workflow)
8. [Code Examples](#code-examples)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment](#production-deployment)
11. [Security Best Practices](#security-best-practices)
12. [Performance & Scaling](#performance--scaling)

---

## Introduction

**WAHA (WhatsApp HTTP API)** is a Docker-based service that provides programmatic access to WhatsApp without requiring the official WhatsApp Business API. It bridges your backend applications with WhatsApp through a simple REST API.

### Key Features
- ✅ Send & receive WhatsApp messages programmatically
- ✅ Session management (auto-QR code login)
- ✅ Media upload/download (images, documents, audio, video)
- ✅ Webhook support for incoming messages and status updates
- ✅ Group management capabilities
- ✅ Multi-session support (handle multiple phone numbers)
- ✅ Message status tracking (sent, delivered, read)
- ✅ Contact & chat information retrieval

### In This BuildDesk Architecture
WAHA is the **messaging transport layer** for the BuildDesk CRM. It handles:
- Sending WhatsApp messages from the frontend dashboard
- Receiving incoming messages and storing them in SQLite
- Syncing WhatsApp chat history
- Broadcasting to contact lists
- Scheduled message delivery

---

## Architecture Overview

### Service Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                    BuildDesk Application                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Frontend (React/Vite)  ────→  Backend (Flask API)              │
│  Port: 8080                    Port: 5000                        │
│  ↓                             ↓                                  │
│  ├─ Chat Interface            ├─ /api/send                      │
│  ├─ Contacts/Lists            ├─ /api/conversation/:phone       │
│  ├─ Scheduler View            ├─ /api/schedule/*                │
│  └─ Dashboard Analytics       ├─ /api/session/status            │
│                               └─ Routes WAHA calls               │
│                                                                   │
│                               ↓                                  │
│                        ┌──────────────┐                         │
│                        │   WAHA       │                         │
│                        │ Port: 3000   │                         │
│                        └──────────────┘                         │
│                               ↓                                  │
│                        WhatsApp Network                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User sends message via Frontend
   ↓
2. Frontend → POST /api/send
   ↓
3. Flask Backend validates & transforms message
   ↓
4. Backend → POST http://waha:3000/api/sendMessage
   ↓
5. WAHA → WhatsApp Network
   ↓
6. Message delivered to recipient
   ↓
7. WAHA Webhook → Backend /webhooks/message
   ↓
8. Backend stores in SQLite Message table
   ↓
9. Frontend polls /api/conversation/:phone (React Query)
   ↓
10. Updated chat displayed in real-time
```

---

## Initial Setup & Installation

### Option 1: Docker Compose (Recommended)

#### Prerequisites
- Docker & Docker Compose installed
- Port 3000 available (WAHA)
- Port 5000 available (Backend)
- Port 8080 available (Frontend)

#### Quick Start
```bash
cd /root/buildesk

# Start all services (including WAHA)
docker compose up --build

# Services will be available at:
# - Frontend: http://localhost:8080
# - Backend: http://localhost:5000
# - WAHA: http://localhost:3000
# - WAHA Dashboard: http://localhost:3000/dashboard (username: admin)
```

#### Docker Compose Configuration (Excerpt)
```yaml
waha:
  image: devlikeapro/waha-plus:latest
  container_name: waha
  restart: always
  environment:
    - WHATSAPP_DEFAULT_ENGINE=WEBJS
    - WAHA_API_KEY=MySecretWAHAKey              # ⚠️ Change in production
    - WAHA_DASHBOARD_USERNAME=admin            # ⚠️ Change in production
    - WAHA_DASHBOARD_PASSWORD=MySecurePassword123
  ports:
    - "3000:3000"
  volumes:
    - waha_data:/app/.waha                      # Persists sessions
```

### Option 2: Standalone WAHA (Manual)

If you want WAHA running separately without Docker:

```bash
# Pull the latest WAHA image
docker pull devlikeapro/waha-plus:latest

# Run WAHA container
docker run -d \
  --name waha \
  -p 3000:3000 \
  -e WAHA_API_KEY="your-secret-key" \
  -e WAHA_DASHBOARD_USERNAME="admin" \
  -e WAHA_DASHBOARD_PASSWORD="secure-password" \
  -e WHATSAPP_DEFAULT_ENGINE=WEBJS \
  -v waha_data:/app/.waha \
  devlikeapro/waha-plus:latest
```

### Option 3: Direct Local Installation (Development)

```bash
# Clone WAHA repository
git clone https://github.com/devlikeapro/waha.git
cd waha

# Install dependencies (Node.js 16+)
npm install

# Set environment variables
export WAHA_API_KEY="development-key"
export WAHA_DASHBOARD_USERNAME="admin"
export WAHA_DASHBOARD_PASSWORD="password"

# Start WAHA
npm start
```

### Verify Installation

```bash
# Check if WAHA is running
curl -X GET http://localhost:3000/api/version \
  -H "Authorization: Bearer MySecretWAHAKey"

# Expected response:
{
  "version": "2024.X.X",
  "engine": "WEBJS",
  "uptime": 1234567
}
```

---

## Configuration & Credentials

### Environment Variables

#### For Backend (Flask) - `.env` or `docker-compose.yml`

```bash
# WAHA Configuration
WAHA_API=http://waha:3000              # WAHA service URL
WAHA_KEY=MySecretWAHAKey               # WAHA API Key

# Database
SQLALCHEMY_DATABASE_URI=sqlite:///instance/buildesk.db

# Flask
SECRET_KEY=your-secret-key-here        # Session secret
FLASK_ENV=production

# N8N Webhooks (AI/Automation)
N8N_WEBHOOK=http://n8n:5678/webhook/magic-ai-template
N8N_NAVIGATOR_URL=http://n8n:5678/webhook/help-bot
N8N_FORGE_URL=http://n8n:5678/webhook/ai-assist

# Optional
GEMINI_API_KEY=your-gemini-key-here   # For AI features
DEBUG=False
```

#### For WAHA - `docker-compose.yml`

```yaml
waha:
  environment:
    - WHATSAPP_DEFAULT_ENGINE=WEBJS         # Engine: WEBJS or NOWEB
    - WAHA_API_KEY=MySecretWAHAKey          # API authentication
    - WAHA_DASHBOARD_USERNAME=admin         # Dashboard login
    - WAHA_DASHBOARD_PASSWORD=secure-pass   # Dashboard password
    - WAHA_WEBHOOK_URL=http://backend:5000  # Callbacks to your backend
    - WAHA_PROXY=socks5://proxy:1080        # Optional SOCKS5 proxy
    - WAHA_LANGUAGE=en                      # UI language
```

### API Key Management

#### Retrieve WAHA API Key
The API Key is crucial for authenticating requests. There are two ways to set it:

1. **Environment Variable** (Set at container start)
   ```bash
   docker run -e WAHA_API_KEY="your-key" ...
   ```

2. **After Running** - Create a new key via Dashboard
   - Go to: http://localhost:3000/dashboard
   - Login with configured credentials
   - Navigate to **Settings** → **API Keys**
   - Click **Generate New Key**

#### Using the API Key

**Include in Request Headers:**
```bash
curl -X GET http://localhost:3000/api/sessions \
  -H "Authorization: Bearer MySecretWAHAKey"
```

---

## WAHA Dashboard & Session Management

### Accessing the Dashboard

**URL:** `http://localhost:3000/dashboard`

**Credentials (from docker-compose.yml):**
- Username: `admin`
- Password: `MySecurePassword123`

### Dashboard Features

#### 1. **Sessions View**
Shows all connected WhatsApp sessions.

- **Session Name:** Unique identifier (default: `default`)
- **Status:** `STARTING`, `AUTHENTICATED`, `FAILED`
- **QR Code:** Generate login QR code
- **Phone Number:** Associated WhatsApp number
- **Engine:** WEBJS or NOWEB

#### 2. **Login via QR Code**

**Steps:**
1. Open Dashboard → Sessions
2. Click **Generate QR Code**
3. Scan with WhatsApp mobile device
4. Confirm login on phone
5. Session status changes to `AUTHENTICATED`

```
Alternative: Use API to create session
POST /api/sessions
{
  "sessionId": "default",
  "engine": "WEBJS"
}
```

#### 3. **Webhooks Configuration**

Set up callbacks for incoming events:

**Via Dashboard:**
- Settings → Webhooks
- Add URL: `http://your-backend:5000/webhooks/message`
- Select events: `message`, `status`, `presence`

**Via API:**
```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer MySecretWAHAKey" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://backend:5000/webhooks/message",
    "events": ["message", "message.status"]
  }'
```

#### 4. **Session Lifecycle**

```
1. CREATE SESSION
   POST /api/sessions
   ↓
2. GENERATE QR
   GET /api/sessions/{sessionId}/qr
   (Returns base64 QR image)
   ↓
3. USER SCANS & AUTHENTICATES
   (WhatsApp auth on phone)
   ↓
4. SESSION AUTHENTICATED
   GET /api/sessions/{sessionId} → status: AUTHENTICATED
   ↓
5. READY TO SEND/RECEIVE MESSAGES
   ↓
6. SESSION LOGOUT (optional)
   POST /api/sessions/{sessionId}/logout
```

---

## API Routes & Endpoints

### Authentication
All WAHA API requests require the API key in the Authorization header:
```bash
-H "Authorization: Bearer YOUR_WAHA_KEY"
```

### Session Management

#### 1. Get All Sessions
```
GET /api/sessions
Authorization: Bearer {WAHA_KEY}

Response:
[
  {
    "sessionId": "default",
    "status": "AUTHENTICATED",
    "engine": "WEBJS",
    "phoneNumber": "+1234567890",
    "me": {
      "id": "1234567890@c.us",
      "pushName": "User Name"
    }
  }
]
```

#### 2. Create Session
```
POST /api/sessions
Authorization: Bearer {WAHA_KEY}
Content-Type: application/json

Body:
{
  "sessionId": "session-name",
  "engine": "WEBJS"
}

Response:
{
  "sessionId": "session-name",
  "status": "STARTING",
  "engine": "WEBJS"
}
```

#### 3. Get Session QR Code
```
GET /api/sessions/{sessionId}/qr
Authorization: Bearer {WAHA_KEY}

Response:
{
  "code": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

#### 4. Stop Session (Logout)
```
POST /api/sessions/{sessionId}/logout
Authorization: Bearer {WAHA_KEY}

Response:
{
  "message": "Session stopped successfully"
}
```

---

### Messaging API

#### 1. Send Text Message
```
POST /api/sendMessage
Authorization: Bearer {WAHA_KEY}
Content-Type: application/json

Body:
{
  "chatId": "1234567890@c.us",
  "text": "Hello, this is a test message!",
  "session": "default"
}

Response:
{
  "message": {
    "id": "wamid.HBEUGRFDJFDJFLJDFL=",
    "timestamp": 1621234567,
    "body": "Hello, this is a test message!"
  }
}
```

#### 2. Send Media Message (Image)
```
POST /api/sendMessage
Authorization: Bearer {WAHA_KEY}
Content-Type: application/json

Body:
{
  "chatId": "1234567890@c.us",
  "media": {
    "url": "https://example.com/image.jpg",
    "type": "image",
    "caption": "Check this image!"
  },
  "session": "default"
}

Response:
{
  "message": {
    "id": "wamid.HBEUGRFDJFDJFLJDFL=",
    "timestamp": 1621234567,
    "hasMedia": true,
    "mediaType": "image"
  }
}
```

#### 3. Send Media from Local File (Base64)
```
POST /api/sendMessage
Authorization: Bearer {WAHA_KEY}

Body:
{
  "chatId": "1234567890@c.us",
  "media": {
    "data": "base64_encoded_file_data",
    "type": "document",
    "caption": "Invoice.pdf",
    "mimetype": "application/pdf"
  },
  "session": "default"
}
```

#### 4. Send Message with Buttons
```
POST /api/sendMessage

Body:
{
  "chatId": "1234567890@c.us",
  "buttons": [
    {
      "id": "btn_1",
      "body": "Option 1"
    },
    {
      "id": "btn_2",
      "body": "Option 2"
    }
  ],
  "body": "Choose an option:",
  "session": "default"
}
```

#### 5. Send List Message
```
POST /api/sendMessage

Body:
{
  "chatId": "1234567890@c.us",
  "list": {
    "buttonText": "View Options",
    "sections": [
      {
        "title": "Products",
        "rows": [
          {
            "id": "prod_1",
            "title": "Product 1",
            "description": "Description here"
          }
        ]
      }
    ]
  },
  "body": "Our catalog:",
  "session": "default"
}
```

---

### Contact & Chat Information

#### 1. Get Contacts
```
GET /api/contacts?session=default
Authorization: Bearer {WAHA_KEY}

Response:
[
  {
    "id": "1234567890@c.us",
    "pushName": "John Doe",
    "isMe": false,
    "isUser": true,
    "isContact": true,
    "isBlocked": false,
    "name": "John Doe",
    "shortName": "John",
    "isBusiness": false
  }
]
```

#### 2. Get Chat History
```
GET /api/chats/{chatId}?session=default
Authorization: Bearer {WAHA_KEY}

Response:
{
  "id": "1234567890@c.us",
  "name": "John Doe",
  "isGroup": false,
  "unreadCount": 0,
  "archived": false,
  "messages": [
    {
      "id": "wamid...",
      "timestamp": 1621234567,
      "from": "1234567890@c.us",
      "body": "Hello there!",
      "type": "chat",
      "isFromMe": false,
      "hasMedia": false
    }
  ]
}
```

#### 3. Get Chat Messages (Paginated)
```
GET /api/chats/{chatId}/messages?limit=50&session=default
Authorization: Bearer {WAHA_KEY}

Response:
{
  "messages": [...],
  "hasMore": true,
  "cursor": "next_page_token"
}
```

---

### Group Management

#### 1. Create Group
```
POST /api/groups
Authorization: Bearer {WAHA_KEY}

Body:
{
  "participants": ["1234567890@c.us", "9876543210@c.us"],
  "subject": "Team Discussion",
  "session": "default"
}

Response:
{
  "id": "123456789-1234567890@g.us",
  "subject": "Team Discussion",
  "participants": 2
}
```

#### 2. Add Group Participant
```
POST /api/groups/{groupId}/participants
Authorization: Bearer {WAHA_KEY}

Body:
{
  "participants": ["1234567890@c.us"],
  "session": "default"
}
```

#### 3. Send Group Message
```
POST /api/sendMessage

Body:
{
  "chatId": "123456789-1234567890@g.us",
  "text": "Attention team!",
  "session": "default"
}
```

---

### Webhooks & Events

#### Incoming Message Event

**WAHA sends POST request to your backend:**

```bash
POST /webhooks/message
Content-Type: application/json

Body:
{
  "event": "message",
  "sessionId": "default",
  "data": {
    "id": "wamid.HBEUGRFDJFDJFLJDFL=",
    "timestamp": 1621234567,
    "from": "1234567890@c.us",
    "to": "9876543210@c.us",
    "body": "Hello, got your message!",
    "type": "chat",
    "isFromMe": false,
    "hasMedia": false,
    "fromMe": false,
    "author": "1234567890@c.us",
    "quotedMsg": null
  }
}
```

#### Message Status Change Event

```bash
POST /webhooks/message
Content-Type: application/json

Body:
{
  "event": "message.status",
  "sessionId": "default",
  "data": {
    "id": "wamid.HBEUGRFDJFDJFLJDFL=",
    "from": "9876543210@c.us",
    "to": "1234567890@c.us",
    "status": "read",
    "timestamp": 1621234567
  }
}
```

**Status values:** `sent`, `delivered`, `read`, `failed`

---

## Complete Workflow

### End-to-End Message Flow

#### **Scenario: Send Message from Frontend Dashboard**

```
1. USER ACTION (Frontend)
   ├─ User opens Contact: "John (1234567890)"
   ├─ Types message: "Hi John, how are you?"
   └─ Clicks "Send"

2. FRONTEND CODE (React)
   ├─ Calls: POST /api/send
   ├─ Payload:
   │  {
   │    "phone": "1234567890",
   │    "message": "Hi John, how are you?",
   │    "contactId": 42
   │  }
   └─ Sends to backend

3. BACKEND VALIDATION (Flask)
   ├─ Checks authentication
   ├─ Validates phone number format
   ├─ Checks contact exists
   └─ Gets contact details from DB

4. BACKEND → WAHA (Flask)
   ├─ Transforms payload:
   │  {
   │    "chatId": "1234567890@c.us",
   │    "text": "Hi John, how are you?",
   │    "session": "default"
   │  }
   ├─ Calls: POST http://waha:3000/api/sendMessage
   └─ Includes Authorization header

5. WAHA PROCESSING
   ├─ Validates API key
   ├─ Checks session is authenticated
   ├─ Queues message for WhatsApp
   ├─ Sends via WhatsApp client
   └─ Returns message ID: wamid.HBE...

6. BACKEND STORAGE (Flask)
   ├─ Stores in database:
   │  Message(
   │    phone="1234567890",
   │    message="Hi John, how are you?",
   │    timestamp=now(),
   │    status="sent",
   │    waha_message_id="wamid.HBE..."
   │  )
   └─ Commits to SQLite

7. BACKEND RESPONSE
   ├─ Returns to frontend:
   │  {
   │    "success": true,
   │    "message_id": "wamid.HBE...",
   │    "timestamp": "2024-01-15T10:30:00Z"
   │  }
   └─ Status 200

8. FRONTEND UPDATE (React)
   ├─ Adds message to chat UI
   ├─ Shows "sending" indicator
   ├─ Clears input field
   └─ Scrolls to latest message

9. WHATSAPP DELIVERY
   ├─ Message delivered to recipient's WhatsApp
   ├─ Recipient's WhatsApp app shows message
   └─ WAHA receives delivery callback

10. WAHA WEBHOOK → BACKEND
    ├─ Sends POST /webhooks/message
    ├─ Event: message.status
    ├─ Status: "delivered"
    └─ Backend updates DB: status = "delivered"

11. FRONTEND POLLING (React Query)
    ├─ Polls /api/conversation/1234567890
    ├─ Gets updated message with status="delivered"
    ├─ Updates UI: message shows checkmark
    └─ Done!
```

### Backend API Workflow (/api/send)

**File: `/root/buildesk/backend/app.py`**

```python
@app.route("/api/send", methods=["POST"])
@login_required
def send_message():
    """
    Send a WhatsApp message through WAHA
    
    Request:
    {
      "phone": "1234567890",
      "message": "Your message",
      "media_url": "optional: https://...",
      "template_id": "optional: template_uuid"
    }
    
    Response:
    {
      "success": true,
      "message_id": "wamid.HBE...",
      "timestamp": "2024-01-15T10:30:00Z"
    }
    """
    data = request.get_json() or {}
    phone = data.get("phone", "").strip()
    message = data.get("message", "").strip()
    media_url = data.get("media_url")
    template_id = data.get("template_id")
    
    if not phone or not message:
        return jsonify({"status": "error", "message": "Phone and message required"}), 400
    
    # Normalize phone: remove spaces, dashes, +
    phone = re.sub(r"[^\d]", "", phone)
    if not phone.isdigit() or len(phone) < 10:
        return jsonify({"status": "error", "message": "Invalid phone format"}), 400
    
    # Get WAHA credentials
    WAHA_API = os.getenv("WAHA_API", "http://localhost:3000")
    WAHA_KEY = os.getenv("WAHA_KEY", "DefaultKey")
    
    # Call WAHA API
    try:
        response = requests.post(
            f"{WAHA_API}/api/sendMessage",
            headers={"Authorization": f"Bearer {WAHA_KEY}"},
            json={
                "chatId": f"{phone}@c.us",
                "text": message,
                "session": "default"
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({
                "status": "error",
                "message": f"WAHA error: {response.text}"
            }), 500
        
        waha_response = response.json()
        message_id = waha_response.get("message", {}).get("id")
        
        # Store in database
        msg = Message(
            contact_id=None,  # Lookup contact by phone if needed
            phone=phone,
            message=message,
            timestamp=datetime.utcnow(),
            status="sent",
            waha_message_id=message_id,
            sender_id=current_user.id
        )
        db.session.add(msg)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message_id": message_id,
            "timestamp": datetime.utcnow().isoformat()
        }), 200
        
    except requests.exceptions.RequestException as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to send via WAHA: {str(e)}"
        }), 500
```

---

## Code Examples

### Python - Send Message

```python
import requests

WAHA_API = "http://localhost:3000"
WAHA_KEY = "MySecretWAHAKey"

def send_whatsapp_message(phone: str, message: str) -> dict:
    """Send a WhatsApp message using WAHA."""
    
    response = requests.post(
        f"{WAHA_API}/api/sendMessage",
        headers={"Authorization": f"Bearer {WAHA_KEY}"},
        json={
            "chatId": f"{phone}@c.us",
            "text": message,
            "session": "default"
        }
    )
    
    if response.status_code == 200:
        return {
            "success": True,
            "message_id": response.json()["message"]["id"]
        }
    else:
        return {
            "success": False,
            "error": response.text
        }

# Usage
result = send_whatsapp_message("1234567890", "Hello from Python!")
print(result)
```

### Python - Send Media (Image)

```python
import requests

def send_whatsapp_image(phone: str, image_url: str, caption: str = "") -> dict:
    """Send an image via WhatsApp."""
    
    response = requests.post(
        f"{WAHA_API}/api/sendMessage",
        headers={"Authorization": f"Bearer {WAHA_KEY}"},
        json={
            "chatId": f"{phone}@c.us",
            "media": {
                "url": image_url,
                "type": "image",
                "caption": caption
            },
            "session": "default"
        }
    )
    
    return response.status_code == 200

# Usage
send_whatsapp_image(
    "1234567890",
    "https://example.com/product.jpg",
    "Check out this product!"
)
```

### Python - Broadcast to Multiple Contacts

```python
def broadcast_message(phone_list: list, message: str):
    """Send same message to multiple contacts."""
    
    results = []
    for phone in phone_list:
        result = send_whatsapp_message(phone, message)
        results.append({
            "phone": phone,
            "success": result["success"]
        })
    
    return results

# Usage
phones = ["1234567890", "9876543210", "5555555555"]
results = broadcast_message(phones, "Important announcement!")
for r in results:
    print(f"{r['phone']}: {'Sent' if r['success'] else 'Failed'}")
```

### JavaScript/Node.js - Send Message

```javascript
const axios = require('axios');

const WAHA_API = "http://localhost:3000";
const WAHA_KEY = "MySecretWAHAKey";

async function sendWhatsAppMessage(phone, message) {
  try {
    const response = await axios.post(
      `${WAHA_API}/api/sendMessage`,
      {
        chatId: `${phone}@c.us`,
        text: message,
        session: "default"
      },
      {
        headers: {
          "Authorization": `Bearer ${WAHA_KEY}`
        }
      }
    );
    
    return {
      success: true,
      messageId: response.data.message.id
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Usage
sendWhatsAppMessage("1234567890", "Hello from Node.js!")
  .then(result => console.log(result));
```

### React - Chat Component Integration

```typescript
// components/ChatInterface.tsx

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface Message {
  id: string;
  text: string;
  timestamp: string;
  isFromMe: boolean;
  status: 'sent' | 'delivered' | 'read';
}

export function ChatInterface({ phone }: { phone: string }) {
  const [newMessage, setNewMessage] = useState('');
  
  // Fetch conversation history
  const { data: messages = [] } = useQuery({
    queryKey: ['conversation', phone],
    queryFn: () => 
      fetch(`/api/conversation/${phone}`).then(r => r.json()),
    refetchInterval: 3000 // Poll every 3 seconds
  });
  
  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: text })
      }).then(r => r.json()),
    onSuccess: () => {
      setNewMessage('');
      // Refetch conversation
    }
  });
  
  const handleSend = () => {
    if (newMessage.trim()) {
      sendMutation.mutate(newMessage);
    }
  };
  
  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map(msg => (
          <div 
            key={msg.id}
            className={`message ${msg.isFromMe ? 'sent' : 'received'}`}
          >
            <p>{msg.text}</p>
            <small>{msg.timestamp}</small>
            {msg.isFromMe && <span className="status">{msg.status}</span>}
          </div>
        ))}
      </div>
      
      <div className="input-area">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
        />
        <button 
          onClick={handleSend}
          disabled={sendMutation.isPending}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

### Webhook Handler - Receive Messages

```python
from flask import request, jsonify

@app.route("/webhooks/message", methods=["POST"])
def handle_waha_webhook():
    """
    Handle incoming messages from WAHA webhook.
    
    WAHA sends POST request with:
    {
      "event": "message",
      "sessionId": "default",
      "data": {
        "id": "wamid...",
        "from": "1234567890@c.us",
        "to": "9876543210@c.us",
        "body": "User's message",
        "timestamp": 1621234567,
        "type": "chat",
        "isFromMe": false,
        "hasMedia": false
      }
    }
    """
    
    try:
        payload = request.get_json()
        event = payload.get("event")
        data = payload.get("data", {})
        
        if event == "message":
            # Extract phone from "from" field (remove @c.us suffix)
            from_phone = data.get("from", "").replace("@c.us", "")
            message_text = data.get("body", "")
            timestamp = data.get("timestamp", 0)
            waha_message_id = data.get("id", "")
            has_media = data.get("hasMedia", False)
            
            # Store in database
            msg = Message(
                phone=from_phone,
                message=message_text,
                timestamp=datetime.fromtimestamp(timestamp / 1000),
                status="received",
                waha_message_id=waha_message_id,
                has_media=has_media
            )
            db.session.add(msg)
            db.session.commit()
            
            # Optional: Trigger notification or auto-response
            print(f"📨 New message from {from_phone}: {message_text}")
            
            return jsonify({"status": "received"}), 200
        
        elif event == "message.status":
            # Update message status
            message_id = data.get("id")
            status = data.get("status")  # sent, delivered, read
            
            msg = Message.query.filter_by(waha_message_id=message_id).first()
            if msg:
                msg.status = status
                db.session.commit()
            
            return jsonify({"status": "processed"}), 200
        
        return jsonify({"status": "ignored"}), 200
        
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
```

---

## Troubleshooting

### Common Issues & Solutions

#### 1. **WAHA Container Won't Start**

**Problem:** Docker container exits immediately

**Solutions:**
```bash
# Check logs
docker logs waha

# Common reasons:
# - Port 3000 already in use
# - Invalid API key format
# - Volume permission issue

# Fix: Stop conflicting service
lsof -i :3000  # Find what's using port 3000
kill -9 <PID>

# Restart WAHA
docker restart waha
```

#### 2. **QR Code Not Generating**

**Problem:** Session stuck in STARTING state

**Solutions:**
```bash
# Check session status
curl -X GET http://localhost:3000/api/sessions \
  -H "Authorization: Bearer MySecretWAHAKey"

# Force restart session
curl -X POST http://localhost:3000/api/sessions/default/stop \
  -H "Authorization: Bearer MySecretWAHAKey"

# Recreate session
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer MySecretWAHAKey" \
  -d '{"sessionId":"default","engine":"WEBJS"}'

# Get fresh QR code
curl -X GET http://localhost:3000/api/sessions/default/qr \
  -H "Authorization: Bearer MySecretWAHAKey"
```

#### 3. **"Not Authenticated" Error When Sending Message**

**Problem:** Messages fail with 401 or session error

**Solutions:**
```bash
# 1. Check if session is authenticated
curl http://localhost:3000/api/sessions \
  -H "Authorization: Bearer MySecretWAHAKey"

# Look for: "status": "AUTHENTICATED"

# 2. If not authenticated, scan QR code again
curl http://localhost:3000/api/sessions/default/qr \
  -H "Authorization: Bearer MySecretWAHAKey"

# 3. Check backend sees WAHA correctly
curl -X GET http://localhost:5000/api/session/status

# Expected response should show WAHA connectivity
```

#### 4. **Messages Not Received in Webhook**

**Problem:** No incoming messages triggering webhook

**Solutions:**
```bash
# 1. Verify webhook is configured in WAHA
curl http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer MySecretWAHAKey"

# 2. Register webhook if missing
curl -X POST http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer MySecretWAHAKey" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://backend:5000/webhooks/message",
    "events": ["message", "message.status"]
  }'

# 3. Test webhook manually (send from another WhatsApp account)
# Or check backend logs:
docker logs buildesk-backend | grep -i webhook
```

#### 5. **Message Sending Works but Status Never Updates**

**Problem:** Messages show "sent" but never show "delivered"

**Solutions:**
```bash
# Check WAHA logs for webhook delivery issues
docker logs waha | tail -50

# Verify backend webhook endpoint is accessible
curl -X POST http://localhost:5000/webhooks/message \
  -H "Content-Type: application/json" \
  -d '{"event":"message.status","data":{"id":"test","status":"delivered"}}'

# Check firewall between WAHA and backend
docker network inspect buildesk_default  # Check connectivity

# Ensure WAHA can reach backend
docker exec waha curl http://buildesk-backend:5000/api/health
```

#### 6. **"API Key Invalid" Error**

**Problem:** 401 Unauthorized for all WAHA API calls

**Solutions:**
```bash
# 1. Check API key in environment
docker exec waha env | grep WAHA_API_KEY

# 2. Verify it's being passed in header correctly
# Wrong: -H "Authorization: MySecretWAHAKey"
# Right: -H "Authorization: Bearer MySecretWAHAKey"

# 3. Generate new API key via dashboard
# http://localhost:3000/dashboard → Settings → API Keys

# 4. Update backend .env
export WAHA_KEY="new-key-from-dashboard"
docker restart buildesk-backend
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Change all default passwords and API keys
- [ ] Enable TLS/HTTPS (use reverse proxy like Nginx)
- [ ] Configure proper firewall rules
- [ ] Set up persistent volumes for database & WAHA data
- [ ] Configure webhook authentication (IP whitelist or token)
- [ ] Set up monitoring & alerting
- [ ] Enable database backups
- [ ] Configure rate limiting on API
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Document deployment process

### Docker Compose Production Configuration

```yaml
version: '3.8'

services:
  # WAHA Production Setup
  waha:
    image: devlikeapro/waha-plus:latest
    container_name: waha
    restart: always
    environment:
      - WHATSAPP_DEFAULT_ENGINE=WEBJS
      - WAHA_API_KEY=${WAHA_API_KEY}  # Use strong random key
      - WAHA_DASHBOARD_USERNAME=${WAHA_DASH_USER}
      - WAHA_DASHBOARD_PASSWORD=${WAHA_DASH_PASS}
      - WAHA_WEBHOOK_URL=https://api.yourdomain.com  # HTTPS
      - WAHA_PROXY=${WAHA_PROXY:-}  # Optional: SOCKS5 proxy
    volumes:
      - waha_data:/app/.waha
    networks:
      - buildesk-net
    # Don't expose WAHA port to public; keep it internal
    ports:
      - "127.0.0.1:3000:3000"  # Localhost only

  buildesk-backend:
    build: ./backend
    container_name: buildesk-backend
    restart: always
    environment:
      - WAHA_API=http://waha:3000  # Internal network
      - WAHA_KEY=${WAHA_API_KEY}
      - SECRET_KEY=${FLASK_SECRET_KEY}
      - FLASK_ENV=production
      - DEBUG=False
    volumes:
      - ./backend/instance:/app/instance
    networks:
      - buildesk-net
    depends_on:
      - waha

  buildesk-frontend:
    build: ./frontend
    container_name: buildesk-frontend
    restart: always
    networks:
      - buildesk-net

  # Nginx Reverse Proxy with TLS
  nginx:
    image: nginx:alpine
    container_name: nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - ./frontend/dist:/usr/share/nginx/html:ro
    networks:
      - buildesk-net
    depends_on:
      - buildesk-backend
      - buildesk-frontend

volumes:
  waha_data:
    driver: local

networks:
  buildesk-net:
    driver: bridge
```

### Nginx Configuration (nginx.conf)

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=webhook_limit:10m rate=100r/s;

    # HTTPS redirect
    server {
        listen 80;
        server_name api.yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name api.yourdomain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # API endpoints
        location /api/ {
            limit_req zone=api_limit burst=20;
            proxy_pass http://buildesk-backend:5000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Webhook endpoints (higher rate limit)
        location /webhooks/ {
            limit_req zone=webhook_limit burst=50;
            proxy_pass http://buildesk-backend:5000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # Static frontend
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }
}
```

### Environment Variables (.env for Production)

```bash
# WAHA Configuration
WAHA_API_KEY=your-super-secure-random-key-here-min-32-chars
WAHA_DASH_USER=admin
WAHA_DASH_PASS=super-secure-dashboard-password

# Flask Backend
FLASK_SECRET_KEY=your-flask-session-secret-key-here
WAHA_API=http://waha:3000
WAHA_KEY=your-super-secure-random-key-here-min-32-chars
SECRET_KEY=your-flask-session-secret-key-here
FLASK_ENV=production
DEBUG=False

# Database
SQLALCHEMY_DATABASE_URI=sqlite:////var/lib/buildesk/buildesk.db

# N8N (if using)
N8N_WEBHOOK=https://api.yourdomain.com/n8n/webhook/template
N8N_NAVIGATOR_URL=https://api.yourdomain.com/n8n/webhook/helpbot
N8N_FORGE_URL=https://api.yourdomain.com/n8n/webhook/ai-assist

# Optional
GEMINI_API_KEY=your-gemini-key-if-using-ai
SENTRY_DSN=your-sentry-dsn-for-error-tracking
```

### Generate Secure Keys

```bash
# Generate WAHA API Key (32 chars random)
openssl rand -base64 24

# Generate Flask Secret Key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Generate SSL Certificate (self-signed, for testing)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# For production, use Let's Encrypt with certbot
```

---

## Security Best Practices

### 1. API Key Management
```bash
# ✅ DO: Use environment variables
export WAHA_KEY=$(openssl rand -base64 32)

# ❌ DON'T: Hardcode keys in code
# WAHA_KEY = "MySecretKey"

# ✅ DO: Rotate keys regularly
# Generate new key and update docker-compose.yml
# Redeploy service

# ❌ DON'T: Commit keys to Git
echo "WAHA_KEY=*" >> .gitignore
```

### 2. Webhook Security
```python
import hmac
import hashlib

def verify_webhook_signature(payload: str, signature: str, secret: str) -> bool:
    """Verify WAHA webhook came from legitimate source."""
    expected_sig = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected_sig)

# In Flask
@app.route("/webhooks/message", methods=["POST"])
def handle_webhook():
    signature = request.headers.get("X-WAHA-Signature")
    if not verify_webhook_signature(
        request.get_data(),
        signature,
        WAHA_KEY
    ):
        return jsonify({"error": "Invalid signature"}), 401
    # Process webhook
```

### 3. Rate Limiting
```python
from flask_limiter import Limiter

limiter = Limiter(
    app,
    key_func=lambda: current_user.id if current_user else request.remote_addr,
    default_limits=["200 per day", "50 per hour"]
)

@app.route("/api/send", methods=["POST"])
@limiter.limit("10 per minute")
def send_message():
    # Send logic
```

### 4. Input Validation
```python
import re
from phonenumbers import parse, is_valid_number

def validate_phone(phone: str) -> bool:
    """Validate phone number format."""
    try:
        parsed = parse(phone, "IN")  # Adjust region as needed
        return is_valid_number(parsed)
    except:
        return False

def sanitize_message(text: str) -> str:
    """Remove potentially dangerous characters."""
    # Allow text, emojis, but block potentially malicious scripts
    return re.sub(r'[<>\"\'`]', '', text)[:4096]  # Max 4096 chars

@app.route("/api/send", methods=["POST"])
def send_message():
    phone = request.json.get("phone")
    if not validate_phone(phone):
        return jsonify({"error": "Invalid phone"}), 400
    
    message = sanitize_message(request.json.get("message", ""))
    # Send message
```

### 5. HTTPS Only
```bash
# In nginx.conf or docker-compose.yml
# Force HTTPS redirect
if ($scheme != "https") {
    return 301 https://$server_name$request_uri;
}

# Also set in Flask
SESSION_COOKIE_SECURE = True  # HTTPS only
SESSION_COOKIE_HTTPONLY = True  # No JS access
SESSION_COOKIE_SAMESITE = 'Lax'  # CSRF protection
```

---

## Performance & Scaling

### 1. Message Queue for High Volume

Instead of synchronous sends, use a queue:

```python
from rq import Queue
from redis import Redis

redis_conn = Redis()
queue = Queue(connection=redis_conn)

@app.route("/api/send", methods=["POST"])
def send_message():
    data = request.get_json()
    # Queue the job instead of sending immediately
    job = queue.enqueue(
        'tasks.send_whatsapp_message',
        data['phone'],
        data['message']
    )
    return jsonify({
        "success": True,
        "job_id": job.id,
        "status": "queued"
    })
```

### 2. Webhook Deduplication

Prevent processing duplicate webhooks:

```python
WEBHOOK_SEEN_CACHE = {}

@app.route("/webhooks/message", methods=["POST"])
def handle_webhook():
    payload = request.get_json()
    message_id = payload['data']['id']
    
    # Check if we already processed this
    if message_id in WEBHOOK_SEEN_CACHE:
        return jsonify({"status": "duplicate"}), 200
    
    # Mark as seen
    WEBHOOK_SEEN_CACHE[message_id] = True
    
    # Process webhook
    # ...
```

### 3. Connection Pooling

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def create_session_with_retries():
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=(500, 502, 504)
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

WAHA_SESSION = create_session_with_retries()

# Use globally
response = WAHA_SESSION.post(f"{WAHA_API}/api/sendMessage", ...)
```

### 4. Multi-Session Load Distribution

For handling multiple phone numbers/sessions:

```bash
# Create multiple WAHA sessions in docker-compose.yml
waha-session-1:
  image: devlikeapro/waha-plus:latest
  # ...
  environment:
    - WAHA_API_KEY=key1
    - SESSION_ID=session1

waha-session-2:
  image: devlikeapro/waha-plus:latest
  # ...
  environment:
    - WAHA_API_KEY=key2
    - SESSION_ID=session2

# In backend, distribute load:
sessions = ["session1", "session2", "session3"]
selected_session = sessions[hash(phone) % len(sessions)]
```

### 5. Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_message_phone ON message(phone);
CREATE INDEX idx_message_timestamp ON message(timestamp);
CREATE INDEX idx_contact_phone ON contact(phone);

-- Implement message archiving
-- Keep only last 90 days in hot storage
DELETE FROM message WHERE timestamp < datetime('now', '-90 days');
```

---

## Conclusion

This guide covers:

✅ **Setup** - Installation via Docker, standalone, or local  
✅ **Configuration** - API keys, environment variables, webhooks  
✅ **Dashboard** - QR code login, session management  
✅ **API Endpoints** - Complete reference for messaging, contacts, groups  
✅ **Workflow** - End-to-end message flow with code examples  
✅ **Examples** - Python, JavaScript, React integration code  
✅ **Troubleshooting** - Common issues and solutions  
✅ **Production** - Deployment, security, performance optimization  

### Quick Reference Commands

```bash
# Start development
docker compose up --build

# Check WAHA health
curl http://localhost:3000/api/version -H "Authorization: Bearer MySecretWAHAKey"

# Get sessions
curl http://localhost:3000/api/sessions -H "Authorization: Bearer MySecretWAHAKey"

# View logs
docker logs -f waha
docker logs -f buildesk-backend

# Send test message
curl -X POST http://localhost:5000/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"1234567890","message":"Test"}'
```

For more info: [WAHA GitHub](https://github.com/devlikeapro/waha) | [WAHA Documentation](https://waha.dev)

---

**Last Updated:** January 2024  
**Version:** 1.0  
**Maintainer:** BuildDesk CRM Team
