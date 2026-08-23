import os
import re
import json
import base64
import time
import uuid
import mimetypes
import traceback
import requests
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, session, send_file
from werkzeug.utils import secure_filename
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import OperationalError
from sqlalchemy import text as sql_text
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_bcrypt import Bcrypt
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "buildesk_production_v5_2026")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config["PREFERRED_URL_SCHEME"] = "https"
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.getenv("SESSION_COOKIE_SECURE", "true").lower() in ("1", "true", "yes")

# --- CORS SETUP ---
_cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://72.60.200.185",
    "http://72.60.200.185:80",
    "http://72.60.200.185:8080",
    "https://waha.cravingcodetech.in",
]
_app_origin = os.getenv("APP_ORIGIN") or f"https://{os.getenv('APP_DOMAIN', 'app.cravingcodetech.in')}"
if _app_origin not in _cors_origins:
    _cors_origins.append(_app_origin)
CORS(app, supports_credentials=True, origins=_cors_origins)

bcrypt = Bcrypt(app)
N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK", "http://n8n:5678/webhook/magic-ai-template")

# --- DATABASE SETUP ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_PATH = os.path.join(BASE_DIR, "instance")
if not os.path.exists(INSTANCE_PATH): os.makedirs(INSTANCE_PATH)

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(INSTANCE_PATH, "buildesk.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- LOGIN MANAGER ---
login_manager = LoginManager(app)

@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({"status": "error", "message": "Unauthorized"}), 401


@app.errorhandler(500)
def handle_500(e):
    return jsonify({"status": "error", "message": str(e) if e else "Internal server error"}), 500


@app.errorhandler(Exception)
def handle_exception(e):
    try:
        traceback.print_exc()
    except Exception:
        pass
    return jsonify({"status": "error", "message": str(e)}), 500


# Ensure Werkzeug HTTP exceptions (413, 400, etc.) return JSON, not HTML
try:
    from werkzeug.exceptions import HTTPException
    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        return jsonify({"status": "error", "message": e.description or str(e)}), e.code
except ImportError:
    pass


# --- BACKGROUND SCHEDULER LOGIC ---
# --- UPDATED SENTRY WORKER ---
def get_ist_now():
    # UTC + 5:30
    return datetime.utcnow() + timedelta(hours=5, minutes=30)

def _acquire_sentry_lock():
    """Acquire exclusive file lock so only one worker runs dispatch (avoids duplicate sends with Gunicorn workers)."""
    try:
        import fcntl
        lock_path = os.path.join(INSTANCE_PATH, "sentry_dispatch.lock")
        fd = os.open(lock_path, os.O_CREAT | os.O_RDWR)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except (BlockingIOError, OSError):
            os.close(fd)
            return None
    except Exception:
        return None


def _release_sentry_lock(fd):
    """Release the sentry dispatch lock."""
    try:
        import fcntl
        if fd is not None:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
    except Exception:
        pass


def sentry_dispatch_worker():
    # Only one process/worker may run dispatch (file lock prevents duplicate sends with multiple Gunicorn workers)
    lock_fd = _acquire_sentry_lock()
    if lock_fd is None:
        return
    try:
        with app.app_context():
            # 1. Synchronize to IST
            now_ist = get_ist_now()

            # 2. Identify due transmissions in the Vault
            due_tasks = ScheduledMessage.query.filter(
                ScheduledMessage.status == 'PENDING',
                ScheduledMessage.scheduled_time <= now_ist
            ).all()

            if not due_tasks:
                return

            print(f"--- SENTRY IST PROTOCOL: {len(due_tasks)} TRANSFERS DUE ---")

            for task in due_tasks:
                try:
                    # 3. Establish WAHA Connection Parameters
                    chat_id = f"{task.phone}@c.us"
                    waha_url = f"{WAHA_API}/api/sendText"

                    # Interpolate template variables (e.g., {{name}})
                    interpolated_content = interpolate_message(task.content, task.phone, task.user_id)

                    payload = {
                        "chatId": chat_id,
                        "text": interpolated_content,
                        "session": get_waha_default_session(task.user_id)
                    }
                    headers = {"X-Api-Key": WAHA_KEY}

                    # 4. Attempt Direct Dispatch
                    print(f"Initiating transfer to: {task.phone}")
                    response = requests.post(waha_url, json=payload, headers=headers, timeout=10)

                    if response.status_code in [200, 201]:
                        task.status = 'SENT'
                        # 5. Mirror to local chat history for the operator
                        db.session.add(Message(
                            phone=task.phone,
                            content=interpolated_content,
                            is_from_me=True,
                            user_id=task.user_id,
                            timestamp=datetime.utcnow()
                        ))
                        print(f"Transfer successful for {task.phone}")
                        # 6. Recurrence: queue next occurrence if configured
                        rec_type = getattr(task, "recurrence_type", None) or "once"
                        rec_config_raw = getattr(task, "recurrence_config", None)
                        rec_config = None
                        if rec_config_raw:
                            try:
                                rec_config = json.loads(rec_config_raw) if isinstance(rec_config_raw, str) else rec_config_raw
                            except Exception:
                                pass
                        if rec_type and rec_type != "once":
                            next_run = get_next_recurrence_time(task.scheduled_time, rec_type, rec_config)
                            if next_run:
                                next_task = ScheduledMessage(
                                    phone=task.phone,
                                    content=task.content,
                                    scheduled_time=next_run,
                                    status="PENDING",
                                    user_id=task.user_id,
                                    list_id=getattr(task, "list_id", None),
                                    list_title=getattr(task, "list_title", None),
                                    recurrence_type=rec_type,
                                    recurrence_config=rec_config_raw or (json.dumps(rec_config) if rec_config else None),
                                )
                                db.session.add(next_task)
                                print(f"Recurrence queued: next at {next_run}")
                    else:
                        print(f"WAHA protocol rejection for {task.phone}: {response.text}")
                        task.status = 'FAILED'

                except Exception as e:
                    print(f"CRITICAL DISPATCH FAILURE for {task.phone}: {str(e)}")
                    task.status = 'FAILED'

            # 6. Commit all matrix updates
            db.session.commit()
    finally:
        _release_sentry_lock(lock_fd)



# --- RE-INITIALIZE SCHEDULER ---
# Scheduler initialization moved to after function definitions (see below)


# --- EXTERNAL SERVICES CONFIG ---
WAHA_API = os.getenv("WAHA_API", "http://waha:3000")
WAHA_KEY = os.getenv("WAHA_KEY", "MySecretWAHAKey")
MEDIA_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "media_store")
os.makedirs(MEDIA_ROOT, exist_ok=True)
MEDIA_PLACEHOLDERS = {
    "", "photo", "video", "voice message", "sticker", "attachment",
}

# --- HELPER: PHONE SANITIZER ---
def sanitize_phone(phone):
    cleaned = re.sub(r'\D', '', str(phone))
    if len(cleaned) == 10:
        return f"91{cleaned}"
    return cleaned

# --- HELPER: TEMPLATE VARIABLE INTERPOLATION ---
def interpolate_message(message, phone, user_id):
    """Replace template variables like {{name}} with actual contact info."""
    result = message
    # Find the contact by phone and user_id
    contact = Lead.query.filter_by(phone=phone, user_id=user_id).first()
    if contact:
        result = result.replace('{{name}}', contact.name or phone)
    return result

# --- MANY-TO-MANY ASSOCIATION TABLE ---
list_members = db.Table('list_members',
    db.Column('lead_id', db.Integer, db.ForeignKey('lead.id'), primary_key=True),
    db.Column('list_id', db.Integer, db.ForeignKey('list.id'), primary_key=True)
)

# --- MODELS ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    leads = db.relationship('Lead', backref='owner', lazy=True)
    messages = db.relationship('Message', backref='author', lazy=True)
    templates = db.relationship('Template', backref='creator', lazy=True)
    lists = db.relationship('List', backref='creator', lazy=True)
    ai_auto_reply = db.Column(db.Boolean, default=False)

class Lead(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    stage = db.Column(db.String(50), default='New')
    date_added = db.Column(db.DateTime, default=datetime.utcnow)
    assigned_to = db.Column(db.String(100), default='Unassigned')
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    unread_count = db.Column(db.Integer, default=0)

class List(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    leads = db.relationship('Lead', secondary=list_members, backref=db.backref('member_of_lists', lazy='dynamic'))

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    phone = db.Column(db.String(20))
    content = db.Column(db.Text)
    is_from_me = db.Column(db.Boolean)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    waha_id = db.Column(db.String(200))
    media_kind = db.Column(db.String(20))
    media_mime = db.Column(db.String(100))
    media_name = db.Column(db.String(255))
    media_path = db.Column(db.String(255))

class Template(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    body = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), default="General") 
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
class ScheduledMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    phone = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    scheduled_time = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), default="PENDING")
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    list_id = db.Column(db.Integer, db.ForeignKey('list.id'), nullable=True)
    list_title = db.Column(db.String(200), nullable=True)
    # Recurrence: "once" | "daily" | "every_n_days" | "weekly" | "hourly"
    recurrence_type = db.Column(db.String(30), default="once")
    recurrence_config = db.Column(db.Text, nullable=True)  # JSON: e.g. {"interval_days":2}, {"days_of_week":[0,4]}, {"interval_hours":1}


class CallReport(db.Model):
    __tablename__ = "call_report"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(255), default="Call")
    url = db.Column(db.String(500), nullable=True)  # audio URL or "Uploaded file: {filename}"
    transcript = db.Column(db.Text, nullable=False)
    summary = db.Column(db.Text)
    sentiment = db.Column(db.String(100))
    score = db.Column(db.String(20), nullable=True)  # AI score (string or number as string)
    key_points = db.Column(db.Text)
    next_action = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Conversation(db.Model):
    """Main conversation flow definition"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Target: "contact" (single phone) or "list" (list_id)
    target_type = db.Column(db.String(20), default="contact")  # "contact" | "list"
    target_phone = db.Column(db.String(20), nullable=True)  # if target_type == "contact"
    target_list_id = db.Column(db.Integer, db.ForeignKey('list.id'), nullable=True)  # if target_type == "list"
    # Initial scheduled message (first step)
    initial_scheduled_time = db.Column(db.DateTime, nullable=True)  # When to start the conversation


class ConversationStep(db.Model):
    """Steps/messages in a conversation flow"""
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    step_order = db.Column(db.Integer, nullable=False)  # Order in the flow (0 = initial message)
    message_content = db.Column(db.Text, nullable=False)  # Message to send
    delay_after_seconds = db.Column(db.Integer, default=0)  # Delay before sending this step (after trigger)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ConversationTrigger(db.Model):
    """Triggers that match customer responses and advance to next step"""
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    from_step_id = db.Column(db.Integer, db.ForeignKey('conversation_step.id'), nullable=False)  # Which step this trigger responds to
    to_step_id = db.Column(db.Integer, db.ForeignKey('conversation_step.id'), nullable=False)  # Which step to go to when triggered
    trigger_type = db.Column(db.String(30), nullable=False)  # "keyword" | "exact" | "contains" | "regex" | "any"
    trigger_value = db.Column(db.Text, nullable=True)  # Keyword(s), exact text, regex pattern, etc. (JSON array for multiple keywords)
    is_case_sensitive = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ConversationInstance(db.Model):
    """Active conversation instance for a specific contact"""
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    current_step_id = db.Column(db.Integer, db.ForeignKey('conversation_step.id'), nullable=True)  # Current step in flow
    status = db.Column(db.String(20), default="active")  # "active" | "completed" | "paused" | "stopped"
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_activity_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Track which triggers have been matched (to avoid loops)
    matched_triggers = db.Column(db.Text, nullable=True)  # JSON array of trigger IDs that have been matched


class Setting(db.Model):
    """Key-value app settings (e.g. per-user waha_default_session)."""
    __tablename__ = "setting"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, nullable=True)


def _ensure_settings_table():
    """Ensure settings table exists (original global key/value storage)."""
    try:
        with db.engine.connect() as conn:
            conn.execute(sql_text(
                "CREATE TABLE IF NOT EXISTS setting (id INTEGER PRIMARY KEY AUTOINCREMENT, key VARCHAR(100) UNIQUE NOT NULL, value TEXT)"
            ))
            conn.commit()
    except Exception as e:
        print(f"Settings table migration skip: {e}")


def get_waha_default_session(user_id=None):
    """
    Return the WAHA session name to use for sending/receiving.

    Order of precedence:
    1) Per-user setting: key = f\"waha_default_session_user_{user_id}\"
    2) Global setting:   key = \"waha_default_session\"
    3) Environment var:  WAHA_DEFAULT_SESSION
    4) Fallback:         \"default\"
    """
    try:
        keys_to_try = []
        if user_id is not None:
            keys_to_try.append(f"waha_default_session_user_{user_id}")
        keys_to_try.append("waha_default_session")

        for k in keys_to_try:
            s = Setting.query.filter_by(key=k).first()
            if s and s.value:
                return s.value.strip()
    except Exception:
        pass
    return os.getenv("WAHA_DEFAULT_SESSION", "default").strip() or "default"


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


def admin_required(f):
    """Restrict route to admin user only."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401
        if current_user.username.lower().strip() != "admin":
            return jsonify({"status": "error", "message": "Admin only"}), 403
        return f(*args, **kwargs)
    return decorated


# --- AUTH API ---
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    user = User.query.filter_by(username=data.get('username')).first()
    if user and bcrypt.check_password_hash(user.password, data.get('password')):
        login_user(user, remember=True)
        return jsonify({"status": "success", "user": {"id": user.id, "username": user.username}})
    return jsonify({"status": "error", "message": "Invalid credentials"}), 401

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({"status": "success", "message": "Logged out"})

@app.route('/api/auth/me', methods=['GET'])
def get_me():
    if current_user.is_authenticated:
        return jsonify({
            "logged_in": True,
            "user": {
                "id": current_user.id,
                "username": current_user.username,
                "ai_enabled": current_user.ai_auto_reply
            }
        })
    return jsonify({"logged_in": False}), 401

@app.route('/api/admin/toggle-ai', methods=['POST'])
@login_required
def toggle_ai():
    # Flips the switch for the current logged-in user
    current_user.ai_auto_reply = not current_user.ai_auto_reply
    db.session.commit()
    return jsonify({
        "status": "success", 
        "ai_enabled": current_user.ai_auto_reply
    })


PREFS_DEFAULTS = {
    "default_country_code": "91",
    "notify_pending_schedules": True,
    "notify_new_messages": True,
    "enter_to_send": True,
}


def _user_prefs_key(user_id):
    return f"user_prefs_{user_id}"


def get_user_prefs(user_id):
    _ensure_settings_table()
    row = Setting.query.filter_by(key=_user_prefs_key(user_id)).first()
    prefs = dict(PREFS_DEFAULTS)
    if row and row.value:
        try:
            stored = json.loads(row.value)
            if isinstance(stored, dict):
                for key, default in PREFS_DEFAULTS.items():
                    if key not in stored:
                        continue
                    value = stored[key]
                    if isinstance(default, bool):
                        prefs[key] = bool(value)
                    elif isinstance(default, str):
                        prefs[key] = str(value).strip() or default
                    else:
                        prefs[key] = value
        except (TypeError, ValueError):
            pass
    digits = "".join(ch for ch in str(prefs.get("default_country_code") or "") if ch.isdigit())[:4]
    prefs["default_country_code"] = digits or PREFS_DEFAULTS["default_country_code"]
    return prefs


@app.route('/api/auth/password', methods=['PUT'])
@login_required
def change_password():
    data = request.json or {}
    current_pw = data.get("current_password") or ""
    new_pw = data.get("new_password") or ""
    if len(new_pw) < 6:
        return jsonify({"status": "error", "message": "New password must be at least 6 characters"}), 400
    if not bcrypt.check_password_hash(current_user.password, current_pw):
        return jsonify({"status": "error", "message": "Current password is incorrect"}), 400
    current_user.password = bcrypt.generate_password_hash(new_pw).decode("utf-8")
    db.session.commit()
    return jsonify({"status": "success"})


@app.route('/api/settings', methods=['GET'])
@login_required
def get_app_settings():
    return jsonify({
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "ai_enabled": bool(current_user.ai_auto_reply),
            "is_admin": current_user.username.lower().strip() == "admin",
        },
        "whatsapp": {
            "default_session": get_waha_default_session(current_user.id),
        },
        "preferences": get_user_prefs(current_user.id),
    })


@app.route('/api/settings/preferences', methods=['PUT'])
@login_required
def update_preferences():
    data = request.json or {}
    prefs = get_user_prefs(current_user.id)
    if "default_country_code" in data:
        digits = "".join(ch for ch in str(data.get("default_country_code") or "") if ch.isdigit())[:4]
        if digits:
            prefs["default_country_code"] = digits
    if "notify_pending_schedules" in data:
        prefs["notify_pending_schedules"] = bool(data.get("notify_pending_schedules"))
    if "notify_new_messages" in data:
        prefs["notify_new_messages"] = bool(data.get("notify_new_messages"))
    if "enter_to_send" in data:
        prefs["enter_to_send"] = bool(data.get("enter_to_send"))
    _ensure_settings_table()
    key = _user_prefs_key(current_user.id)
    payload = json.dumps(prefs)
    row = Setting.query.filter_by(key=key).first()
    if row:
        row.value = payload
    else:
        db.session.add(Setting(key=key, value=payload))
    db.session.commit()
    return jsonify({"preferences": prefs})


@app.route('/api/settings/auto-reply', methods=['PUT'])
@login_required
def set_auto_reply():
    data = request.json or {}
    current_user.ai_auto_reply = bool(data.get("enabled"))
    db.session.commit()
    return jsonify({"status": "success", "ai_enabled": current_user.ai_auto_reply})
    
@app.route('/api/sentry/status', methods=['GET'])
def sentry_status():
    # We use a secret key instead of login_required for the n8n bot
    sentry_key = request.headers.get("X-Buildesk-Sentry")
    SECRET_SENTRY_TOKEN = "Matrix_Sentry_Secure_2026" # Keep this private

    if sentry_key != SECRET_SENTRY_TOKEN:
        return jsonify({"status": "error", "message": "Invalid Sentry Key"}), 401
    
    # Assuming we check the 'admin' user's global toggle
    user = User.query.filter_by(username='admin').first()
    if not user:
        return jsonify({"ai_enabled": False}), 404
        
    return jsonify({
        "ai_enabled": user.ai_auto_reply,
        "operator": user.username
    })

# --- HELP BOT NAVIGATOR ---
# --- HELP BOT NAVIGATOR PROXY ---
@app.route('/api/helpbot', methods=['POST'])
@login_required
def helpbot_chat():
    data = request.json
    user_query = data.get('message')
    
    if not user_query:
        return jsonify({"output": "Systems ready. Please provide a query."}), 400

    try:
        # Forward to n8n
        NAVIGATOR_WEBHOOK = os.getenv("N8N_NAVIGATOR_URL", "http://n8n:5678/webhook/buildesk-navigator")
        response = requests.post(NAVIGATOR_WEBHOOK, json={
            "message": user_query,
            "user": current_user.username
        }, timeout=15)

        if response.status_code == 200:
            raw_data = response.json()
            
            # --- UPDATED DRILLING LOGIC ---
            # 1. Handle if n8n returns an array [ {...} ]
            packet = raw_data[0] if isinstance(raw_data, list) else raw_data
            
            # 2. Extract text from Gemini structure: packet -> content -> parts -> [0] -> text
            try:
                ai_text = packet.get('content', {}).get('parts', [{}])[0].get('text', "")
                
                # Fallback if structure is different (some n8n nodes vary)
                if not ai_text:
                    ai_text = packet.get('output', packet.get('text', "I processed the request but found no text output."))
                
                return jsonify({"output": ai_text})
                
            except (KeyError, IndexError, AttributeError):
                return jsonify({"output": "The Matrix returned an unreadable data format."})
        else:
            return jsonify({"output": "The AI Node is currently offline."}), 502
            
    except Exception as e:
        return jsonify({"output": f"Proxy Error: {str(e)}"}), 500

# --- CRM & CONTACTS API ---
@app.route('/api/dashboard/stats', methods=['GET'])
@login_required
def get_stats():
    from sqlalchemy import func, and_
    from datetime import datetime, timedelta
    
    # Query params: days (7|14|30|90), date_from, date_to (ISO date), stage (filter leads by stage)
    days_param = request.args.get('days', type=int)
    date_from_param = request.args.get('date_from')
    date_to_param = request.args.get('date_to')
    stage_filter = request.args.get('stage', '').strip() or None
    
    # Resolve date range (UTC)
    now = datetime.utcnow()
    if date_from_param and date_to_param:
        try:
            start_dt = datetime.fromisoformat(date_from_param.replace('Z', '')).replace(tzinfo=None)
            end_dt = datetime.fromisoformat(date_to_param.replace('Z', '')).replace(tzinfo=None)
            if start_dt.tzinfo:
                start_dt = start_dt.replace(tzinfo=None)
            if end_dt.tzinfo:
                end_dt = end_dt.replace(tzinfo=None)
            range_start = start_dt
            range_end = min(end_dt, now)
        except (ValueError, TypeError):
            range_start = now - timedelta(days=7)
            range_end = now
    else:
        days = 7
        if days_param in (7, 14, 30, 90):
            days = days_param
        range_start = now - timedelta(days=days)
        range_end = now
    
    # Base lead query (optional stage filter)
    lead_base = Lead.query.filter_by(user_id=current_user.id)
    if stage_filter:
        lead_base = lead_base.filter(Lead.stage == stage_filter)
    
    # Basic counts (leads filtered by stage when provided)
    total_leads = lead_base.count()
    total_msgs = Message.query.filter_by(user_id=current_user.id).count()
    total_segments = List.query.filter_by(user_id=current_user.id).count()
    pending_schedules = ScheduledMessage.query.filter_by(
        user_id=current_user.id, 
        status='PENDING'
    ).count()
    
    # Stage distribution (all stages; when stage filter set, single key)
    stage_counts = db.session.query(
        Lead.stage, 
        func.count(Lead.id).label('count')
    ).filter_by(user_id=current_user.id).group_by(Lead.stage).all()
    stage_distribution = {stage or 'New': count for stage, count in stage_counts}
    
    # Recent activity in date range
    recent_leads = lead_base.filter(Lead.date_added >= range_start).count()
    recent_messages = Message.query.filter(
        and_(
            Message.user_id == current_user.id,
            Message.timestamp >= range_start,
            Message.timestamp <= range_end
        )
    ).count()
    
    # Messages over time in date range
    messages_by_day = db.session.query(
        func.date(Message.timestamp).label('date'),
        func.count(Message.id).label('count')
    ).filter(
        and_(
            Message.user_id == current_user.id,
            Message.timestamp >= range_start,
            Message.timestamp <= range_end
        )
    ).group_by(func.date(Message.timestamp)).order_by(func.date(Message.timestamp)).all()
    
    messages_timeline = [
        {"date": str(date), "count": count} 
        for date, count in messages_by_day
    ]
    
    leads_by_stage = {stage or 'New': count for stage, count in stage_counts}
    
    return jsonify({
        "total_leads": total_leads,
        "total_msgs": total_msgs,
        "total_segments": total_segments,
        "pending_schedules": pending_schedules,
        "recent_leads": recent_leads,
        "recent_messages": recent_messages,
        "stage_distribution": stage_distribution,
        "messages_timeline": messages_timeline,
        "leads_by_stage": leads_by_stage,
        "date_from": range_start.isoformat() + 'Z',
        "date_to": range_end.isoformat() + 'Z',
    })


_inbox_sync_at = {}
_recently_read_at = {}


def _ensure_lead_unread_column():
    """Add unread_count to lead if missing (existing DBs)."""
    try:
        with db.engine.connect() as conn:
            conn.execute(sql_text("ALTER TABLE lead ADD COLUMN unread_count INTEGER DEFAULT 0"))
            conn.commit()
    except Exception as e:
        if "duplicate column" not in str(e).lower():
            print(f"Lead unread migration skip: {e}")


def _ensure_message_media_columns():
    """Add media columns to message if missing (existing DBs)."""
    try:
        with db.engine.connect() as conn:
            for col, typ in [
                ("waha_id", "VARCHAR(200)"),
                ("media_kind", "VARCHAR(20)"),
                ("media_mime", "VARCHAR(100)"),
                ("media_name", "VARCHAR(255)"),
                ("media_path", "VARCHAR(255)"),
            ]:
                try:
                    conn.execute(sql_text(f"ALTER TABLE message ADD COLUMN {col} {typ}"))
                    conn.commit()
                except Exception as e:
                    if "duplicate column" not in str(e).lower():
                        raise
    except Exception as e:
        print(f"Message media migration skip: {e}")


@app.before_request
def _ensure_inbox_schema():
    if getattr(app, "_lead_unread_ready", False):
        return
    _ensure_lead_unread_column()
    _ensure_message_media_columns()
    app._lead_unread_ready = True


def _phone_from_waha_chat_id(chat_id):
    if not chat_id:
        return None
    if isinstance(chat_id, dict):
        chat_id = chat_id.get("_serialized") or chat_id.get("user") or ""
    chat_id = str(chat_id)
    if "@g.us" in chat_id or "@broadcast" in chat_id or "status@" in chat_id:
        return None
    if "@c.us" in chat_id:
        return sanitize_phone(chat_id.split("@")[0])
    digits = re.sub(r"\D", "", chat_id)
    if len(digits) >= 10:
        return sanitize_phone(digits)
    return None


def _waha_last_message_text(last_message):
    if not isinstance(last_message, dict):
        return ""
    body = (last_message.get("body") or last_message.get("text") or last_message.get("caption") or "").strip()
    if body:
        return body
    msg_type = (last_message.get("type") or last_message.get("mimetype") or "").lower()
    if last_message.get("hasMedia") or any(k in msg_type for k in ("image", "video", "audio", "ptt", "document", "sticker")):
        if "image" in msg_type:
            return "Photo"
        if "video" in msg_type:
            return "Video"
        if "audio" in msg_type or "ptt" in msg_type:
            return "Voice message"
        if "sticker" in msg_type:
            return "Sticker"
        return "Attachment"
    return ""


def _message_already_stored(user_id, phone, body, timestamp, is_from_me):
    ts_lo = timestamp - timedelta(seconds=2)
    ts_hi = timestamp + timedelta(seconds=2)
    return Message.query.filter(
        Message.phone == phone,
        Message.content == body,
        Message.is_from_me == is_from_me,
        Message.user_id == user_id,
        Message.timestamp >= ts_lo,
        Message.timestamp <= ts_hi,
    ).first()


def _mark_chat_read(user, phone):
    _ensure_lead_unread_column()
    _recently_read_at[(user.id, phone)] = time.time()
    lead = Lead.query.filter_by(phone=phone, user_id=user.id).first()
    if lead and (getattr(lead, "unread_count", 0) or 0):
        lead.unread_count = 0
        db.session.commit()
    try:
        session_name = get_waha_default_session(user.id)
        requests.post(
            f"{WAHA_API}/api/{session_name}/chats/{phone}@c.us/messages/read",
            headers={"X-Api-Key": WAHA_KEY},
            timeout=2,
        )
    except Exception:
        pass


def _saved_leads_by_phone(user_id):
    """Map sanitized phone / last-10 digits to leads already saved in the dashboard."""
    by_phone = {}
    by_tail = {}
    for lead in Lead.query.filter_by(user_id=user_id).all():
        if not lead.phone:
            continue
        phone = sanitize_phone(lead.phone) or lead.phone
        by_phone[lead.phone] = lead
        by_phone[phone] = lead
        tail = phone[-10:] if len(phone) >= 10 else phone
        by_tail[tail] = lead
    return by_phone, by_tail


def _lead_for_synced_phone(phone, by_phone, by_tail):
    if not phone:
        return None
    lead = by_phone.get(phone)
    if lead:
        return lead
    tail = phone[-10:] if len(phone) >= 10 else phone
    return by_tail.get(tail)


def _parse_waha_chat_list(response):
    if response is None or not getattr(response, "ok", False):
        return None
    try:
        payload = response.json()
    except Exception:
        return None
    chats = payload if isinstance(payload, list) else (payload.get("chats") or payload.get("data"))
    return chats if isinstance(chats, list) else None


def _fetch_waha_overview_for_contacts(session_name, headers, chat_ids):
    """Ask WAHA only for saved contacts; fall back to a recent list if filter is unsupported."""
    overview = f"{WAHA_API}/api/{session_name}/chats/overview"
    chats_url = f"{WAHA_API}/api/{session_name}/chats"
    if chat_ids:
        if len(chat_ids) > 80:
            r = requests.post(
                overview,
                headers={**headers, "Content-Type": "application/json"},
                json={"pagination": {"limit": min(len(chat_ids), 400), "offset": 0}, "filter": {"ids": chat_ids[:400]}},
                timeout=4,
            )
            chats = _parse_waha_chat_list(r)
            if chats is not None:
                return chats
        params = [("limit", str(min(max(len(chat_ids), 1), 200))), ("offset", "0")]
        for cid in chat_ids[:200]:
            params.append(("ids", cid))
        r = requests.get(overview, headers=headers, params=params, timeout=4)
        chats = _parse_waha_chat_list(r)
        if chats is not None:
            return chats
    r = requests.get(f"{overview}?limit=80&offset=0", headers=headers, timeout=4)
    chats = _parse_waha_chat_list(r)
    if chats is not None:
        return chats
    r = requests.get(
        f"{chats_url}?limit=80&offset=0&sortBy=conversationTimestamp&sortOrder=desc",
        headers=headers,
        timeout=4,
    )
    return _parse_waha_chat_list(r) or []


def _sync_inbox_from_waha(user):
    """Refresh last message + unread only for contacts already saved in the dashboard."""
    _ensure_lead_unread_column()
    now = time.time()
    last = _inbox_sync_at.get(user.id, 0)
    if now - last < 3:
        return
    _inbox_sync_at[user.id] = now
    by_phone, by_tail = _saved_leads_by_phone(user.id)
    if not by_phone:
        return
    chat_ids = [f"{phone}@c.us" for phone in {lead.phone for lead in by_phone.values() if lead.phone}]
    session_name = get_waha_default_session(user.id)
    headers = {"X-Api-Key": WAHA_KEY}
    try:
        chats = _fetch_waha_overview_for_contacts(session_name, headers, chat_ids)
    except Exception as e:
        print(f"Inbox sync skip: {e}")
        return
    if not chats:
        return

    dirty = False
    for chat in chats:
        if not isinstance(chat, dict):
            continue
        phone = _phone_from_waha_chat_id(chat.get("id") or chat.get("chatId"))
        lead = _lead_for_synced_phone(phone, by_phone, by_tail)
        if not lead:
            continue
        raw_last = chat.get("lastMessage")
        last_message = raw_last if isinstance(raw_last, dict) else {}
        body = _waha_last_message_text(last_message)
        ts_val = last_message.get("timestamp") or chat.get("conversationTimestamp") or chat.get("timestamp")
        from_me = bool(last_message.get("fromMe"))
        unread = chat.get("unreadCount")
        nested_chat = chat.get("_chat") if isinstance(chat.get("_chat"), dict) else {}
        if unread is None:
            unread = nested_chat.get("unreadCount")
        if unread is None:
            unread = chat.get("unread")

        stored_new_incoming = False
        if last_message:
            if ts_val is not None:
                try:
                    ts_num = float(ts_val)
                    if ts_num > 1e12:
                        ts_num = ts_num / 1000.0
                    timestamp = datetime.utcfromtimestamp(ts_num)
                except (TypeError, ValueError, OSError):
                    timestamp = datetime.utcnow()
            else:
                timestamp = datetime.utcnow()
            display = body or "Attachment"
            saved_phone = lead.phone
            if from_me:
                recent_out = Message.query.filter(
                    Message.phone == saved_phone,
                    Message.is_from_me == True,
                    Message.user_id == user.id,
                    Message.content == display,
                    Message.timestamp >= timestamp - timedelta(seconds=30),
                ).first()
                if not recent_out and not _message_already_stored(user.id, saved_phone, display, timestamp, True):
                    db.session.add(Message(
                        phone=saved_phone, content=display, is_from_me=True,
                        user_id=user.id, timestamp=timestamp,
                    ))
                    dirty = True
            elif not _message_already_stored(user.id, saved_phone, display, timestamp, False):
                db.session.add(Message(
                    phone=saved_phone, content=display, is_from_me=False,
                    user_id=user.id, timestamp=timestamp,
                ))
                stored_new_incoming = True
                dirty = True

        count = None
        if unread is not None:
            try:
                count = max(0, int(unread))
            except (TypeError, ValueError):
                count = None
        recently_read = now - _recently_read_at.get((user.id, lead.phone), 0) < 15
        current = getattr(lead, "unread_count", 0) or 0
        if count is not None:
            if count == 0 or not recently_read:
                if current != count:
                    lead.unread_count = count
                    dirty = True
        elif stored_new_incoming and not recently_read:
            lead.unread_count = current + 1
            dirty = True

    if dirty:
        db.session.commit()


@app.route('/api/contacts', methods=['GET'])
@login_required
def get_contacts():
    _sync_inbox_from_waha(current_user)
    leads = Lead.query.filter_by(user_id=current_user.id).all()
    # Per-phone latest message time and preview (incoming or outgoing) for sorting and notifications
    last_msg = db.session.query(
        Message.phone,
        db.func.max(Message.timestamp).label('last_ts')
    ).filter(Message.user_id == current_user.id).group_by(Message.phone).all()
    last_ts_map = {phone: ts for phone, ts in last_msg}
    # Build phone -> (content_preview, timestamp) from most recent messages
    recent = Message.query.filter_by(user_id=current_user.id).order_by(Message.timestamp.desc()).all()
    last_preview_map = {}
    for m in recent:
        if m.phone and m.phone not in last_preview_map:
            snippet = (m.content or "")[:60].replace("\n", " ") if m.content else ""
            last_preview_map[m.phone] = (snippet, m.timestamp)
    min_dt = datetime.min
    # Sort: latest message first, then by date_added desc for contacts with no messages
    leads_sorted = sorted(
        leads,
        key=lambda l: (last_ts_map.get(l.phone) or min_dt,),
        reverse=True
    )
    out = []
    for lead in leads_sorted:
        preview, last_at = last_preview_map.get(lead.phone, (None, None))
        out.append({
            "id": lead.id, "name": lead.name, "phone": lead.phone,
            "stage": lead.stage or "New", "assigned_to": lead.assigned_to or "Unassigned",
            "date": lead.date_added.isoformat() + 'Z' if lead.date_added else None,
            "last_message_preview": preview,
            "last_message_at": last_at.isoformat() + 'Z' if last_at else None,
            "unread_count": getattr(lead, "unread_count", 0) or 0,
        })
    return jsonify(out)

@app.route('/api/contacts', methods=['POST'])
@login_required
def add_contact():
    data = request.json
    if not data: return jsonify({"status": "error"}), 400

    if isinstance(data, list):
        for item in data:
            phone = sanitize_phone(item.get('phone', ''))
            if not Lead.query.filter_by(phone=phone, user_id=current_user.id).first():
                db.session.add(Lead(phone=phone, name=item.get('name', 'Bulk'), user_id=current_user.id))
        db.session.commit()
        return jsonify({"status": "success"}), 201

    phone = sanitize_phone(data.get('phone', ''))
    if not Lead.query.filter_by(phone=phone, user_id=current_user.id).first():
        db.session.add(Lead(phone=phone, name=data.get('name', 'New'), user_id=current_user.id))
        db.session.commit()
    return jsonify({"status": "success"}), 201

@app.route('/api/contacts/bulk-update', methods=['PUT'])
@login_required
def bulk_update_contacts():
    data = request.json
    if not data or 'ids' not in data:
        return jsonify({"status": "error", "message": "Missing ids parameter"}), 400
    
    ids = data.get('ids', [])
    stage = data.get('stage')
    assigned_to = data.get('assigned_to')
    
    if not ids:
        return jsonify({"status": "error", "message": "No contact IDs provided"}), 400
    
    # Update all contacts that belong to the current user
    leads = Lead.query.filter(Lead.id.in_(ids), Lead.user_id == current_user.id).all()
    
    if not leads:
        return jsonify({"status": "error", "message": "No matching contacts found"}), 404
    
    updated_count = 0
    for lead in leads:
        if stage is not None:
            lead.stage = stage
        if assigned_to is not None:
            lead.assigned_to = assigned_to
        updated_count += 1
    
    db.session.commit()
    return jsonify({
        "status": "success", 
        "message": f"Updated {updated_count} contacts",
        "updated": updated_count
    })

@app.route('/api/contacts/<int:lead_id>', methods=['PUT', 'DELETE'])
@login_required
def manage_single_contact(lead_id):
    lead = Lead.query.filter_by(id=lead_id, user_id=current_user.id).first_or_404()
    
    if request.method == 'DELETE':
        lead.member_of_lists = [] 
        db.session.delete(lead)
        db.session.commit()
        return jsonify({"status": "success", "message": "Lead purged"})

    if request.method == 'PUT':
        data = request.json
        lead.name = data.get('name', lead.name)
        lead.phone = sanitize_phone(data.get('phone', lead.phone))
        lead.stage = data.get('stage', lead.stage)
        lead.assigned_to = data.get('assigned_to', lead.assigned_to)
        db.session.commit()
        return jsonify({"status": "success"})

# --- LIST MANAGER API ---

@app.route('/api/lists', methods=['GET', 'POST'])
@login_required
def manage_lists():
    if request.method == 'POST':
        data = request.json
        new_list = List(title=data.get('title'), description=data.get('description', ''), user_id=current_user.id)
        db.session.add(new_list); db.session.commit()
        return jsonify({"status": "success", "id": new_list.id}), 201

    user_lists = List.query.filter_by(user_id=current_user.id).all()
    return jsonify([{"id": l.id, "title": l.title, "count": len(l.leads)} for l in user_lists])

@app.route('/api/lists/<int:list_id>', methods=['GET', 'DELETE'])
@login_required
def single_list(list_id):
    l = List.query.filter_by(id=list_id, user_id=current_user.id).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(l); db.session.commit()
        return jsonify({"status": "success"})
    return jsonify({"id": l.id, "title": l.title, "leads": [{"id": lead.id, "name": lead.name, "phone": lead.phone} for lead in l.leads]})

@app.route('/api/lists/<int:list_id>/leads', methods=['GET'])
@login_required
def get_list_leads(list_id):
    l = List.query.filter_by(id=list_id, user_id=current_user.id).first_or_404()
    return jsonify([{
        "id": lead.id, "name": lead.name, "phone": lead.phone, "stage": lead.stage
    } for lead in l.leads])

@app.route('/api/lists/<int:list_id>/add-leads', methods=['POST'])
@login_required
def add_leads_to_list(list_id):
    l = List.query.filter_by(id=list_id, user_id=current_user.id).first_or_404()
    lead_ids = request.json.get('lead_ids', [])
    leads = Lead.query.filter(Lead.id.in_(lead_ids), Lead.user_id == current_user.id).all()
    for lead in leads:
        if lead not in l.leads: l.leads.append(lead)
    db.session.commit()
    return jsonify({"status": "success"})

@app.route('/api/lists/<int:list_id>/remove-lead', methods=['POST'])
@login_required
def remove_lead_from_list(list_id):
    l = List.query.filter_by(id=list_id, user_id=current_user.id).first_or_404()
    lead_id = request.json.get('lead_id')
    lead = Lead.query.get_or_404(lead_id)
    if lead in l.leads:
        l.leads.remove(lead)
        db.session.commit()
        return jsonify({"status": "success"})
    return jsonify({"status": "error"}), 400

@app.route('/api/lists/<int:list_id>/broadcast', methods=['POST'])
@login_required
def broadcast_to_list(list_id):
    l = List.query.filter_by(id=list_id, user_id=current_user.id).first_or_404()

    # Support both JSON text broadcasts and multipart media broadcasts
    if request.content_type and request.content_type.startswith("multipart/"):
        # Media broadcast
        file = request.files.get("file")
        caption = (request.form.get("message") or "").strip()
        if not file or file.filename == "":
            return jsonify({"status": "error", "message": "Missing file"}), 400

        try:
            import base64

            raw = file.read()
            b64 = base64.b64encode(raw).decode("utf-8")
            mimetype = file.content_type or "application/octet-stream"
            filename = file.filename or "attachment"

            session_name = get_waha_default_session(current_user.id)
            headers = {"X-Api-Key": WAHA_KEY, "Content-Type": "application/json"}

            # Choose WAHA endpoint based on mimetype (same strategy as /api/send-media)
            if mimetype.startswith("image/"):
                endpoint = f"{WAHA_API}/api/sendImage"
            elif mimetype.startswith("audio/"):
                endpoint = f"{WAHA_API}/api/sendVoice"
            else:
                endpoint = f"{WAHA_API}/api/sendFile"

            sent = 0
            for lead in l.leads:
                # Interpolate caption for each lead (replace {{name}} with actual name)
                interpolated_caption = interpolate_message(caption, lead.phone, current_user.id)
                chat_id = f"{lead.phone}@c.us"
                payload = {
                    "session": session_name,
                    "chatId": chat_id,
                    "file": {
                        "mimetype": mimetype,
                        "filename": filename,
                        "data": b64,
                    },
                    "caption": interpolated_caption or "",
                }
                if mimetype.startswith("audio/"):
                    payload["convert"] = True

                try:
                    r = requests.post(endpoint, json=payload, headers=headers, timeout=30)
                    if r.status_code not in (200, 201):
                        # Skip counting failures but continue with other leads
                        continue

                    if mimetype.startswith("image/"):
                        display = interpolated_caption or f"🖼️ Image: {filename}"
                    elif mimetype.startswith("audio/"):
                        display = interpolated_caption or f"🎤 Audio: {filename}"
                    else:
                        display = interpolated_caption or f"📎 Document: {filename}"

                    db.session.add(
                        Message(
                            phone=lead.phone,
                            content=display,
                            is_from_me=True,
                            user_id=current_user.id,
                        )
                    )
                    sent += 1
                except Exception:
                    continue

            db.session.commit()
            return jsonify(
                {
                    "status": "success",
                    "message": f"Media sent to {sent} recipients",
                }
            )
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    else:
        # Text-only broadcast (existing behavior)
        text = (request.json or {}).get('message', '')
        if not text:
            return jsonify({"status": "error"}), 400
        session_name = get_waha_default_session(current_user.id)
        sent = 0
        for lead in l.leads:
            try:
                # Interpolate message for each lead
                interpolated_text = interpolate_message(text, lead.phone, current_user.id)
                requests.post(
                    f"{WAHA_API}/api/sendText",
                    json={"chatId": f"{lead.phone}@c.us", "text": interpolated_text, "session": session_name},
                    headers={"X-Api-Key": WAHA_KEY},
                    timeout=5,
                )
                db.session.add(Message(phone=lead.phone, content=interpolated_text, is_from_me=True, user_id=current_user.id))
                sent += 1
            except Exception:
                continue
        db.session.commit()
        return jsonify({"status": "success", "message": f"Sent to {sent} recipients"})

# --- CHAT & MESSAGING ---
def process_conversation_triggers():
    """Worker to process incoming messages and match them against conversation triggers."""
    try:
        with app.app_context():
            _ensure_conversation_tables()
            # Get recent incoming messages (last 5 minutes) that haven't been processed
            cutoff = datetime.utcnow() - timedelta(minutes=5)
            recent_messages = Message.query.filter(
                Message.is_from_me == False,
                Message.timestamp >= cutoff
            ).order_by(Message.timestamp.desc()).all()
            
            for msg in recent_messages:
                # Find active conversation instances for this phone
                instances = ConversationInstance.query.filter_by(
                    phone=msg.phone,
                    status="active"
                ).all()
                
                for instance in instances:
                    conv = Conversation.query.get(instance.conversation_id)
                    if not conv or not conv.is_active:
                        continue
                    
                    # Get current step
                    current_step = ConversationStep.query.get(instance.current_step_id) if instance.current_step_id else None
                    if not current_step:
                        continue
                    
                    # Get triggers for current step
                    triggers = ConversationTrigger.query.filter_by(from_step_id=current_step.id).all()
                    
                    matched_trigger = None
                    for trigger in triggers:
                        if match_trigger(msg.content, trigger):
                            matched_trigger = trigger
                            break
                    
                    if matched_trigger:
                        # Check if this trigger was already matched (avoid loops)
                        matched_ids = json.loads(instance.matched_triggers or "[]")
                        if matched_trigger.id in matched_ids:
                            continue  # Already processed this trigger
                        
                        # Advance to next step
                        next_step = ConversationStep.query.get(matched_trigger.to_step_id)
                        if next_step:
                            instance.current_step_id = next_step.id
                            matched_ids.append(matched_trigger.id)
                            instance.matched_triggers = json.dumps(matched_ids)
                            instance.last_activity_at = datetime.utcnow()
                            
                            # Schedule the next step message
                            delay_seconds = next_step.delay_after_seconds or 0
                            send_time = datetime.utcnow() + timedelta(seconds=delay_seconds)
                            
                            scheduled_msg = ScheduledMessage(
                                phone=msg.phone,
                                content=next_step.message_content,
                                scheduled_time=send_time,
                                status="PENDING",
                                user_id=instance.user_id
                            )
                            db.session.add(scheduled_msg)
                            db.session.commit()
                            
                            print(f"Conversation trigger matched: {msg.phone} -> Step {next_step.step_order}")
    except Exception as e:
        print(f"Conversation trigger processing error: {e}")
        import traceback
        traceback.print_exc()


def match_trigger(message_content: str, trigger: ConversationTrigger) -> bool:
    """Check if message content matches a trigger."""
    if not message_content or not trigger:
        return False
    
    content = message_content if trigger.is_case_sensitive else message_content.lower()
    
    if trigger.trigger_type == "any":
        return True
    
    if trigger.trigger_type == "exact":
        value = trigger.trigger_value if trigger.is_case_sensitive else trigger.trigger_value.lower()
        return content.strip() == value.strip()
    
    if trigger.trigger_type == "contains":
        value = trigger.trigger_value if trigger.is_case_sensitive else trigger.trigger_value.lower()
        return value in content
    
    if trigger.trigger_type == "keyword":
        # trigger_value is JSON array of keywords
        try:
            keywords = json.loads(trigger.trigger_value) if isinstance(trigger.trigger_value, str) else trigger.trigger_value
            if not isinstance(keywords, list):
                keywords = [keywords]
            for keyword in keywords:
                kw = keyword if trigger.is_case_sensitive else keyword.lower()
                if kw in content:
                    return True
        except Exception:
            # Fallback: treat as single keyword
            kw = trigger.trigger_value if trigger.is_case_sensitive else trigger.trigger_value.lower()
            return kw in content
    
    if trigger.trigger_type == "regex":
        import re
        flags = 0 if trigger.is_case_sensitive else re.IGNORECASE
        try:
            return bool(re.search(trigger.trigger_value, content, flags))
        except Exception:
            return False
    
    return False


def start_conversation_instances():
    """Worker to start new conversation instances when initial_scheduled_time arrives."""
    try:
        with app.app_context():
            _ensure_conversation_tables()
            now = datetime.utcnow()
            # Find conversations that should start now
            due_conversations = Conversation.query.filter(
                Conversation.is_active == True,
                Conversation.initial_scheduled_time <= now,
                Conversation.initial_scheduled_time.isnot(None)
            ).all()
            
            for conv in due_conversations:
                # Get first step (step_order = 0)
                first_step = ConversationStep.query.filter_by(
                    conversation_id=conv.id,
                    step_order=0
                ).first()
                
                if not first_step:
                    continue
                
                # Determine target phones
                target_phones = []
                if conv.target_type == "contact" and conv.target_phone:
                    target_phones = [conv.target_phone]
                elif conv.target_type == "list" and conv.target_list_id:
                    target_list = List.query.get(conv.target_list_id)
                    if target_list:
                        target_phones = [lead.phone for lead in target_list.leads]
                
                for phone in target_phones:
                    # Check if instance already exists
                    existing = ConversationInstance.query.filter_by(
                        conversation_id=conv.id,
                        phone=phone,
                        user_id=conv.user_id
                    ).first()
                    
                    if existing:
                        continue  # Already started
                    
                    # Create instance
                    instance = ConversationInstance(
                        conversation_id=conv.id,
                        phone=phone,
                        user_id=conv.user_id,
                        current_step_id=first_step.id,
                        status="active"
                    )
                    db.session.add(instance)
                    
                    # Schedule first message
                    scheduled_msg = ScheduledMessage(
                        phone=phone,
                        content=first_step.message_content,
                        scheduled_time=now + timedelta(seconds=first_step.delay_after_seconds or 0),
                        status="PENDING",
                        user_id=conv.user_id
                    )
                    db.session.add(scheduled_msg)
                
                # Clear initial_scheduled_time to prevent restarting
                conv.initial_scheduled_time = None
                db.session.commit()
                
                print(f"Started conversation instances for: {conv.name}")
    except Exception as e:
        print(f"Start conversation instances error: {e}")
        import traceback
        traceback.print_exc()


# --- INITIALIZE SCHEDULER (after function definitions) ---
scheduler = BackgroundScheduler()
# Check every 30 seconds for higher precision
scheduler.add_job(func=sentry_dispatch_worker, trigger="interval", seconds=30)
# Process conversation triggers every 10 seconds
scheduler.add_job(func=process_conversation_triggers, trigger="interval", seconds=10)
# Start conversation instances every 30 seconds
scheduler.add_job(func=start_conversation_instances, trigger="interval", seconds=30)
scheduler.start()


def _waha_message_id(raw):
    mid = raw.get("id") if isinstance(raw, dict) else None
    if isinstance(mid, dict):
        mid = mid.get("_serialized") or mid.get("id")
    return str(mid) if mid else None


def _media_kind_from(mime, msg_type=""):
    mime = (mime or "").lower()
    msg_type = (msg_type or "").lower()
    if msg_type == "sticker" or "sticker" in mime:
        return "sticker"
    if mime.startswith("image/") or msg_type == "image":
        return "image"
    if mime.startswith("video/") or msg_type == "video":
        return "video"
    if mime.startswith("audio/") or msg_type in ("audio", "ptt", "voice"):
        return "audio"
    if mime or msg_type in ("document", "file"):
        return "document"
    return None


def _waha_media_info(raw):
    if not isinstance(raw, dict):
        return None
    media = raw.get("media") if isinstance(raw.get("media"), dict) else {}
    url = media.get("url") or raw.get("mediaUrl")
    mime = media.get("mimetype") or raw.get("mimetype") or ""
    filename = media.get("filename") or raw.get("filename") or ""
    error = media.get("error")
    has_media = bool(raw.get("hasMedia") or url or mime)
    if not has_media or error:
        return None
    kind = _media_kind_from(mime, raw.get("type") or "")
    if not kind and not url:
        return None
    return {"url": url, "mime": mime, "name": filename, "kind": kind or "document"}


def _rewrite_waha_file_url(url):
    if not url:
        return url
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(url)
        if "/api/files" not in (parsed.path or ""):
            return url
        base = urlparse(WAHA_API)
        return urlunparse((base.scheme or "http", base.netloc or parsed.netloc, parsed.path, "", parsed.query, ""))
    except Exception:
        return url


def _store_media_bytes(user_id, raw_bytes, mime, filename):
    if not raw_bytes:
        return None
    if len(raw_bytes) > 25 * 1024 * 1024:
        return None
    ext = ""
    safe_name = secure_filename(filename or "")
    if safe_name and "." in safe_name:
        ext = os.path.splitext(safe_name)[1][:12]
    if not ext and mime:
        guessed = mimetypes.guess_extension(mime.split(";")[0].strip())
        ext = guessed or ""
    stored = f"{user_id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(MEDIA_ROOT, stored)
    with open(path, "wb") as fh:
        fh.write(raw_bytes)
    return stored


def _download_waha_media(url, mime, filename, user_id):
    fetch_url = _rewrite_waha_file_url(url)
    if not fetch_url:
        return None
    try:
        r = requests.get(fetch_url, headers={"X-Api-Key": WAHA_KEY}, timeout=20)
        if not r.ok or not r.content:
            return None
        return _store_media_bytes(user_id, r.content, mime or r.headers.get("Content-Type"), filename)
    except Exception as e:
        print(f"Media download skip: {e}")
        return None


def _apply_media_to_message(msg, media_info, user_id):
    if not media_info or getattr(msg, "media_path", None):
        return False
    stored = _download_waha_media(media_info.get("url"), media_info.get("mime"), media_info.get("name"), user_id)
    if not stored:
        return False
    msg.media_path = stored
    msg.media_kind = media_info.get("kind") or "document"
    msg.media_mime = (media_info.get("mime") or "")[:100]
    msg.media_name = (media_info.get("name") or "")[:255]
    return True


def _message_public_dict(m):
    has_file = bool(getattr(m, "media_path", None))
    return {
        "id": m.id,
        "content": m.content,
        "is_from_me": m.is_from_me,
        "time": m.timestamp.isoformat() + "Z" if m.timestamp else "",
        "media_kind": getattr(m, "media_kind", None) if has_file else None,
        "media_url": f"/api/media/{m.id}" if has_file else None,
        "media_name": getattr(m, "media_name", None) if has_file else None,
        "media_mime": getattr(m, "media_mime", None) if has_file else None,
    }


@app.route('/api/media/<int:message_id>', methods=['GET'])
@login_required
def get_message_media(message_id):
    _ensure_message_media_columns()
    msg = Message.query.filter_by(id=message_id, user_id=current_user.id).first()
    stored = getattr(msg, "media_path", None) if msg else None
    if not msg or not stored:
        return jsonify({"status": "error", "message": "Not found"}), 404
    path = os.path.join(MEDIA_ROOT, os.path.basename(stored))
    if not os.path.isfile(path):
        return jsonify({"status": "error", "message": "File missing"}), 404
    return send_file(
        path,
        mimetype=getattr(msg, "media_mime", None) or "application/octet-stream",
        download_name=getattr(msg, "media_name", None) or os.path.basename(path),
        as_attachment=False,
    )


@app.route('/api/conversation/<phone>', methods=['GET'])
@login_required
def get_messages(phone):
    _ensure_message_media_columns()
    try:
        chat_id = f"{phone}@c.us"
        session_name = get_waha_default_session(current_user.id)
        url = f"{WAHA_API}/api/{session_name}/chats/{chat_id}/messages?limit=30&downloadMedia=true"
        response = requests.get(url, headers={"X-Api-Key": WAHA_KEY}, timeout=20)
        if response.status_code == 200:
            raw_msgs = response.json()
            seen_waha = set()
            incoming_msgs = []
            for m in raw_msgs:
                ts = m.get('timestamp')
                mid = _waha_message_id(m)
                key = (mid or m.get('body', ''), round(float(ts)) if ts is not None else 0, m.get('fromMe', False))
                if key in seen_waha:
                    continue
                seen_waha.add(key)
                incoming_msgs.append(m)

            for m in incoming_msgs:
                body = (m.get('body') or m.get('caption') or "").strip()
                ts_val = m.get('timestamp')
                timestamp = datetime.utcfromtimestamp(ts_val) if ts_val is not None else datetime.utcnow()
                is_from_me = m.get('fromMe', False)
                media_info = _waha_media_info(m)
                waha_id = _waha_message_id(m)
                if is_from_me and not media_info:
                    continue
                ts_lo = timestamp - timedelta(seconds=2)
                ts_hi = timestamp + timedelta(seconds=2)
                exists = None
                if waha_id:
                    exists = Message.query.filter_by(waha_id=waha_id, user_id=current_user.id).first()
                if not exists:
                    exists = Message.query.filter(
                        Message.phone == phone,
                        Message.content == body,
                        Message.is_from_me == is_from_me,
                        Message.user_id == current_user.id,
                        Message.timestamp >= ts_lo,
                        Message.timestamp <= ts_hi,
                    ).first()
                if not exists and media_info:
                    nearby = Message.query.filter(
                        Message.phone == phone,
                        Message.is_from_me == is_from_me,
                        Message.user_id == current_user.id,
                        Message.timestamp >= ts_lo,
                        Message.timestamp <= ts_hi,
                    ).all()
                    for candidate in nearby:
                        text = (candidate.content or "").strip().lower()
                        if text in MEDIA_PLACEHOLDERS or text.startswith("🖼️") or text.startswith("🎤") or text.startswith("📎"):
                            exists = candidate
                            break
                if exists:
                    changed = False
                    if waha_id and not getattr(exists, "waha_id", None):
                        exists.waha_id = waha_id
                        changed = True
                    if media_info and _apply_media_to_message(exists, media_info, current_user.id):
                        if not (exists.content or "").strip() and body:
                            exists.content = body
                        changed = True
                    if changed:
                        db.session.add(exists)
                    continue
                msg = Message(
                    phone=phone,
                    content=body,
                    is_from_me=is_from_me,
                    user_id=current_user.id,
                    timestamp=timestamp,
                    waha_id=waha_id,
                )
                if media_info:
                    _apply_media_to_message(msg, media_info, current_user.id)
                db.session.add(msg)
            db.session.commit()
    except Exception as e: print(f"WAHA Sync Warning: {e}")

    _mark_chat_read(current_user, phone)

    msgs = Message.query.filter_by(phone=phone, user_id=current_user.id).order_by(Message.timestamp.asc()).all()
    seen = set()
    out = []
    for m in msgs:
        key = (m.content, m.timestamp.isoformat() if m.timestamp else "", m.is_from_me, getattr(m, "media_path", None) or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(_message_public_dict(m))
    return jsonify(out)

@app.route('/api/send', methods=['POST'])
@login_required
def send_msg():
    data = request.json or {}
    phone = sanitize_phone(data.get('to', ''))
    text = interpolate_message(data.get('message', ''), phone, current_user.id)
    
    try:
        requests.post(
            f"{WAHA_API}/api/sendText",
            json={"chatId": f"{phone}@c.us", "text": text, "session": get_waha_default_session(current_user.id)},
            headers={"X-Api-Key": WAHA_KEY},
            timeout=5,
        )
        db.session.add(Message(phone=phone, content=text, is_from_me=True, user_id=current_user.id))
        db.session.commit()
        return jsonify({"status": "success"})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/send-media', methods=['POST'])
@login_required
def send_media():
    """Send image, document, or audio attachment via WAHA. Form: to, message (caption), file."""
    phone = sanitize_phone(request.form.get('to', ''))
    caption = (request.form.get('message') or '').strip()
    caption = interpolate_message(caption, phone, current_user.id)
    
    if not phone:
        return jsonify({"status": "error", "message": "Missing 'to' (phone)"}), 400
    file = request.files.get('file')
    if not file or file.filename == '':
        return jsonify({"status": "error", "message": "Missing file"}), 400

    try:
        file_data = file.read()
        b64 = base64.b64encode(file_data).decode('utf-8')
        mimetype = file.content_type or 'application/octet-stream'
        filename = file.filename or 'attachment'

        session_name = get_waha_default_session(current_user.id)
        chat_id = f"{phone}@c.us"
        payload = {
            "session": session_name,
            "chatId": chat_id,
            "file": {
                "mimetype": mimetype,
                "filename": filename,
                "data": b64,
            },
            "caption": caption or "",
        }
        headers = {"X-Api-Key": WAHA_KEY, "Content-Type": "application/json"}

        if mimetype.startswith('image/'):
            endpoint = f"{WAHA_API}/api/sendImage"
        elif mimetype.startswith('audio/'):
            payload["convert"] = True
            endpoint = f"{WAHA_API}/api/sendVoice"
        else:
            endpoint = f"{WAHA_API}/api/sendFile"

        r = requests.post(endpoint, json=payload, headers=headers, timeout=30)
        if r.status_code not in (200, 201):
            return jsonify({"status": "error", "message": r.text or "WAHA rejected media"}), 400
        _ensure_message_media_columns()
        stored = _store_media_bytes(current_user.id, file_data, mimetype, filename)
        kind = _media_kind_from(mimetype, "")
        msg = Message(
            phone=phone,
            content=caption or "",
            is_from_me=True,
            user_id=current_user.id,
            media_kind=kind,
            media_mime=mimetype[:100],
            media_name=filename[:255],
            media_path=stored,
        )
        db.session.add(msg)
        db.session.commit()
        return jsonify({
            "status": "success",
            "message": _message_public_dict(msg),
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --- TEMPLATES API ---
@app.route('/api/templates', methods=['GET', 'POST'])
@login_required
def manage_templates():
    if request.method == 'POST':
        data = request.json
        new_tpl = Template(title=data.get('title'), body=data.get('body'), category=data.get('category', 'General'), user_id=current_user.id)
        db.session.add(new_tpl); db.session.commit()
        return jsonify({"status": "success", "id": new_tpl.id}), 201
    ts = Template.query.filter_by(user_id=current_user.id).all()
    return jsonify([{'id': t.id, 'title': t.title, 'body': t.body, 'category': t.category} for t in ts])


# --- CALL ANALYSIS (Gemini) ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
N8N_VOICE_INTELLIGENCE_URL = os.getenv("N8N_VOICE_INTELLIGENCE_URL", "http://n8n:5678/webhook/voice-intelligence")


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
N8N_VOICE_INTELLIGENCE_URL = os.getenv("N8N_VOICE_INTELLIGENCE_URL", "http://72.60.200.185:5678/webhook/voice-intelligence")
CHUNK_LENGTH_MS = 30000 # 30-second chunks for better Google API stability

# --- TACTICAL HELPER: AI RESPONSE CLEANER ---
def clean_ai_json(text):
    """Deep cleans AI output to ensure valid JSON extraction."""
    try:
        # Remove markdown code blocks if present
        clean_text = re.sub(r"```(?:json)?\s*|```", "", text).strip()
        return json.loads(clean_text)
    except Exception as e:
        print(f"JSON Clean Error: {e} | Raw: {text[:100]}")
        return None

# --- 1. IMPROVED TRANSCRIPTION ENGINE ---
def transcribe_audio_file(audio_path):
    """Splits audio into chunks and uses Google SR with error recovery."""
    try:
        import speech_recognition as sr
        from pydub import AudioSegment
        import tempfile
    except ImportError:
        return "Missing dependencies: pip install pydub SpeechRecognition"

    try:
        audio = AudioSegment.from_file(audio_path)
        audio = audio.set_channels(1).set_frame_rate(16000)
        
        recognizer = sr.Recognizer()
        recognizer.energy_threshold = 300 # Adjust for background noise
        
        full_transcript = []
        tmp_dir = tempfile.mkdtemp()

        for i, start_ms in enumerate(range(0, len(audio), CHUNK_LENGTH_MS)):
            chunk = audio[start_ms:start_ms + CHUNK_LENGTH_MS]
            path = os.path.join(tmp_dir, f"chunk_{i}.wav")
            chunk.export(path, format="wav")
            
            try:
                with sr.AudioFile(path) as source:
                    audio_data = recognizer.record(source)
                    text = recognizer.recognize_google(audio_data, language="en-US")
                    if text: full_transcript.append(text)
            except Exception:
                continue # Skip silent or unreadable chunks
            finally:
                if os.path.exists(path): os.remove(path)

        return " ".join(full_transcript).strip()
    except Exception as e:
        print(f"Transcription Engine Failure: {e}")
        return ""

# --- 2. THE INTELLIGENCE CORE (GEMINI) ---
def analyze_transcript_with_gemini(transcript):
    """Analyzes transcript with a focus on repairing imperfect text."""
    if not GEMINI_API_KEY: return None
    
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        # TACTICAL PROMPT: Instructs AI to fix "imperfect" transcripts
        prompt = f"""
        TASK: Analyze the following call transcript. 
        NOTE: The transcript was generated via AI and may contain phonetic errors or missing words. 
        Use context to 'repair' the meaning before analyzing.

        RETURN ONLY JSON:
        {{
          "summary": "3-5 bullet points of what actually happened",
          "sentiment": "Positive/Negative/Concerned/Neutral",
          "score": "Integer 0-100 based on call success/lead quality",
          "key_points": ["Point 1", "Point 2"],
          "next_action": "Clear next step for the operator"
        }}

        TRANSCRIPT:
        {transcript[:30000]}
        """
        
        response = model.generate_content(prompt)
        return clean_ai_json(response.text)
    except Exception as e:
        print(f"Gemini Analysis Error: {e}")
        return None

# --- 3. THE N8N BRIDGE ---
def analyze_transcript_with_n8n(transcript):
    """Attempts to use n8n for analysis with deep extraction logic."""
    if not N8N_VOICE_INTELLIGENCE_URL: return None
    
    try:
        # 1. Dispatch to n8n Webhook
        res = requests.post(N8N_VOICE_INTELLIGENCE_URL, json={"transcript": transcript}, timeout=45)
        res.raise_for_status()
        raw_data = res.json()
        
        # 2. Handle the Array structure: [ { "content": ... } ]
        packet = raw_data[0] if isinstance(raw_data, list) else raw_data
        
        # 3. Tactical Extraction: Navigate the Gemini/n8n nesting
        # We are looking for: packet['content']['parts'][0]['text']
        try:
            inner_json_string = packet.get('content', {}).get('parts', [{}])[0].get('text', "")
            
            # 4. JSON Synthesis: Convert the inner string into a dictionary
            # Using our clean_ai_json helper to strip potential markdown blocks
            result = clean_ai_json(inner_json_string)
            
            if result:
                print(f"Intelligence Extracted: Score {result.get('score')}/100")
                return result
                
        except (KeyError, IndexError, AttributeError) as e:
            print(f"Matrix Drilling Failed: {str(e)}")
            
        return None # Fallback to direct Gemini if n8n format is unrecognized
        
    except Exception as e:
        print(f"n8n Webhook Connection Error: {e}")
        return None

# --- 4. MAIN ANALYSIS ROUTE ---
@app.route('/api/call-analysis/analyze', methods=['POST'])
@login_required
def call_analysis_analyze():
    try:
        transcript = ""
        title = request.form.get("title", "Manual Upload")
        source_info = ""

        # A. Handle File Upload
        if 'audio_file' in request.files:
            file = request.files['audio_file']
            if file.filename:
                import tempfile
                ext = os.path.splitext(file.filename)[1]
                fd, path = tempfile.mkstemp(suffix=ext)
                os.close(fd)
                file.save(path)
                
                transcript = transcribe_audio_file(path)
                source_info = f"File: {file.filename}"
                os.remove(path)

        # B. Handle Text Input
        elif request.is_json:
            data = request.get_json()
            transcript = data.get("transcript", "")
            title = data.get("title", "Text Analysis")
            source_info = "Manual Text Entry"

        if not transcript or len(transcript) < 10:
            return jsonify({"status": "error", "message": "Transcript too short or audio unreadable"}), 400

        # C. Sequential Analysis (n8n -> Gemini -> Fallback)
        result = analyze_transcript_with_n8n(transcript)
        if not result:
            result = analyze_transcript_with_gemini(transcript)

        if not result:
            return jsonify({"status": "error", "message": "AI Analysis nodes are currently offline"}), 502

        # D. Format summary with bullet points if needed
        summary_text = result.get("summary", "No summary generated")
        if summary_text and summary_text != "No summary generated":
            # Ensure summary has bullet points if it doesn't already
            if not any(line.strip().startswith(("•", "-", "*")) for line in summary_text.split("\n") if line.strip()):
                # Split by sentences and format as bullet points
                sentences = [s.strip() for s in summary_text.split(". ") if s.strip()]
                if len(sentences) > 1:
                    summary_text = "\n".join(f"• {s}" + ("." if not s.endswith(".") else "") for s in sentences)
                else:
                    summary_text = f"• {summary_text}"
        
        # Format key_points
        key_points_list = result.get("key_points", [])
        if isinstance(key_points_list, str):
            key_points_text = key_points_list
        elif isinstance(key_points_list, list):
            key_points_text = "\n".join(f"• {str(kp).strip()}" if not str(kp).strip().startswith(("•", "-", "*")) else str(kp).strip() for kp in key_points_list if kp)
        else:
            key_points_text = ""
        
        # D. Commit to Database (CallReport Model)
        report = CallReport(
            user_id=current_user.id,
            title=title,
            url=source_info,
            transcript=transcript,
            summary=summary_text,
            sentiment=result.get("sentiment", "Neutral"),
            score=str(result.get("score", "0")),
            key_points=key_points_text,
            next_action=result.get("next_action", "No follow-up defined")
        )
        db.session.add(report)
        db.session.commit()

        return jsonify({
            "status": "success", 
            "report": {
                "id": report.id,
                "title": report.title,
                "url": report.url or "",
                "transcript": report.transcript,
                "summary": report.summary,
                "sentiment": report.sentiment,
                "score": report.score or "",
                "key_points": report.key_points or "",
                "next_action": report.next_action or "",
                "created_at": report.created_at.isoformat() + "Z" if report.created_at else None
            }
        }), 201

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

# --- CALL ANALYSIS REPORT ENDPOINTS ---
@app.route('/api/call-analysis/reports', methods=['GET'])
@login_required
def get_call_analysis_reports():
    """Get all call analysis reports for the current user."""
    try:
        reports = CallReport.query.filter_by(user_id=current_user.id).order_by(CallReport.created_at.desc()).all()
        return jsonify([{
            "id": r.id,
            "title": r.title,
            "url": r.url or "",
            "summary": (r.summary or "")[:200],  # Truncated for list view
            "sentiment": r.sentiment or "",
            "score": r.score or "",
            "created_at": r.created_at.isoformat() + "Z" if r.created_at else None
        } for r in reports])
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/call-analysis/reports/<int:report_id>', methods=['GET'])
@login_required
def get_call_analysis_report(report_id):
    """Get a specific call analysis report with full details."""
    try:
        report = CallReport.query.filter_by(id=report_id, user_id=current_user.id).first_or_404()
        return jsonify({
            "id": report.id,
            "title": report.title,
            "url": report.url or "",
            "transcript": report.transcript or "",
            "summary": report.summary or "",
            "sentiment": report.sentiment or "",
            "score": report.score or "",
            "key_points": report.key_points or "",
            "next_action": report.next_action or "",
            "created_at": report.created_at.isoformat() + "Z" if report.created_at else None
        })
    except Exception as e:
        if hasattr(e, 'code') and e.code == 404:
            return jsonify({"status": "error", "message": "Report not found"}), 404
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/call-analysis/reports/<int:report_id>', methods=['DELETE'])
@login_required
def delete_call_analysis_report(report_id):
    """Delete a call analysis report."""
    try:
        report = CallReport.query.filter_by(id=report_id, user_id=current_user.id).first_or_404()
        db.session.delete(report)
        db.session.commit()
        return jsonify({"status": "success", "message": "Report deleted"})
    except Exception as e:
        if hasattr(e, 'code') and e.code == 404:
            return jsonify({"status": "error", "message": "Report not found"}), 404
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
    
    

# --- CONVERSATION API ---
@app.route('/api/conversations', methods=['GET', 'POST'])
@login_required
def manage_conversations():
    """Get all conversations or create a new one."""
    if request.method == 'POST':
        data = request.json
        conv = Conversation(
            user_id=current_user.id,
            name=data.get('name', 'Untitled Conversation'),
            description=data.get('description'),
            target_type=data.get('target_type', 'contact'),
            target_phone=data.get('target_phone'),
            target_list_id=data.get('target_list_id'),
            initial_scheduled_time=datetime.fromisoformat(data.get('initial_scheduled_time').replace('Z', '')) if data.get('initial_scheduled_time') else None,
            is_active=data.get('is_active', True)
        )
        db.session.add(conv)
        db.session.commit()
        return jsonify({"status": "success", "id": conv.id}), 201
    
    # GET: Return all conversations
    _ensure_conversation_tables()
    conversations = Conversation.query.filter_by(user_id=current_user.id).order_by(Conversation.created_at.desc()).all()
    return jsonify([{
        "id": c.id,
        "name": c.name,
        "description": c.description,
        "is_active": c.is_active,
        "target_type": c.target_type,
        "target_phone": c.target_phone,
        "target_list_id": c.target_list_id,
        "initial_scheduled_time": c.initial_scheduled_time.isoformat() + "Z" if c.initial_scheduled_time else None,
        "created_at": c.created_at.isoformat() + "Z" if c.created_at else None,
        "step_count": ConversationStep.query.filter_by(conversation_id=c.id).count(),
    } for c in conversations])


@app.route('/api/conversations/<int:conv_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def manage_conversation(conv_id):
    """Get, update, or delete a conversation."""
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    
    if request.method == 'DELETE':
        # Delete related steps, triggers, and instances
        ConversationTrigger.query.filter_by(conversation_id=conv_id).delete()
        ConversationStep.query.filter_by(conversation_id=conv_id).delete()
        ConversationInstance.query.filter_by(conversation_id=conv_id).delete()
        db.session.delete(conv)
        db.session.commit()
        return jsonify({"status": "success"})
    
    if request.method == 'PUT':
        data = request.json
        if 'name' in data:
            conv.name = data['name']
        if 'description' in data:
            conv.description = data.get('description')
        if 'is_active' in data:
            conv.is_active = data['is_active']
        if 'target_type' in data:
            conv.target_type = data['target_type']
        if 'target_phone' in data:
            conv.target_phone = data.get('target_phone')
        if 'target_list_id' in data:
            conv.target_list_id = data.get('target_list_id')
        if 'initial_scheduled_time' in data:
            conv.initial_scheduled_time = datetime.fromisoformat(data['initial_scheduled_time'].replace('Z', '')) if data.get('initial_scheduled_time') else None
        conv.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({"status": "success"})
    
    # GET: Return full conversation with steps and triggers
    steps = ConversationStep.query.filter_by(conversation_id=conv_id).order_by(ConversationStep.step_order).all()
    triggers = ConversationTrigger.query.filter_by(conversation_id=conv_id).all()
    
    return jsonify({
        "id": conv.id,
        "name": conv.name,
        "description": conv.description,
        "is_active": conv.is_active,
        "target_type": conv.target_type,
        "target_phone": conv.target_phone,
        "target_list_id": conv.target_list_id,
        "initial_scheduled_time": conv.initial_scheduled_time.isoformat() + "Z" if conv.initial_scheduled_time else None,
        "created_at": conv.created_at.isoformat() + "Z" if conv.created_at else None,
        "steps": [{
            "id": s.id,
            "step_order": s.step_order,
            "message_content": s.message_content,
            "delay_after_seconds": s.delay_after_seconds,
        } for s in steps],
        "triggers": [{
            "id": t.id,
            "from_step_id": t.from_step_id,
            "to_step_id": t.to_step_id,
            "trigger_type": t.trigger_type,
            "trigger_value": t.trigger_value,
            "is_case_sensitive": t.is_case_sensitive,
        } for t in triggers],
    })


@app.route('/api/conversations/<int:conv_id>/steps', methods=['POST'])
@login_required
def add_conversation_step(conv_id):
    """Add a step to a conversation."""
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    data = request.json
    step = ConversationStep(
        conversation_id=conv_id,
        step_order=data.get('step_order', 0),
        message_content=data.get('message_content', ''),
        delay_after_seconds=data.get('delay_after_seconds', 0)
    )
    db.session.add(step)
    db.session.commit()
    return jsonify({"status": "success", "id": step.id}), 201


@app.route('/api/conversations/<int:conv_id>/steps/<int:step_id>', methods=['PUT', 'DELETE'])
@login_required
def manage_conversation_step(conv_id, step_id):
    """Update or delete a conversation step."""
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    step = ConversationStep.query.filter_by(id=step_id, conversation_id=conv_id).first_or_404()
    
    if request.method == 'DELETE':
        # Delete related triggers
        ConversationTrigger.query.filter_by(from_step_id=step_id).delete()
        ConversationTrigger.query.filter_by(to_step_id=step_id).delete()
        db.session.delete(step)
        db.session.commit()
        return jsonify({"status": "success"})
    
    # PUT: Update step
    data = request.json
    if 'step_order' in data:
        step.step_order = data['step_order']
    if 'message_content' in data:
        step.message_content = data['message_content']
    if 'delay_after_seconds' in data:
        step.delay_after_seconds = data['delay_after_seconds']
    db.session.commit()
    return jsonify({"status": "success"})


@app.route('/api/conversations/<int:conv_id>/triggers', methods=['POST'])
@login_required
def add_conversation_trigger(conv_id):
    """Add a trigger to a conversation."""
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    data = request.json
    trigger = ConversationTrigger(
        conversation_id=conv_id,
        from_step_id=data.get('from_step_id'),
        to_step_id=data.get('to_step_id'),
        trigger_type=data.get('trigger_type', 'keyword'),
        trigger_value=json.dumps(data.get('trigger_value')) if isinstance(data.get('trigger_value'), list) else data.get('trigger_value'),
        is_case_sensitive=data.get('is_case_sensitive', False)
    )
    db.session.add(trigger)
    db.session.commit()
    return jsonify({"status": "success", "id": trigger.id}), 201


@app.route('/api/conversations/<int:conv_id>/triggers/<int:trigger_id>', methods=['PUT', 'DELETE'])
@login_required
def manage_conversation_trigger(conv_id, trigger_id):
    """Update or delete a conversation trigger."""
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    trigger = ConversationTrigger.query.filter_by(id=trigger_id, conversation_id=conv_id).first_or_404()
    
    if request.method == 'DELETE':
        db.session.delete(trigger)
        db.session.commit()
        return jsonify({"status": "success"})
    
    # PUT: Update trigger
    data = request.json
    if 'from_step_id' in data:
        trigger.from_step_id = data['from_step_id']
    if 'to_step_id' in data:
        trigger.to_step_id = data['to_step_id']
    if 'trigger_type' in data:
        trigger.trigger_type = data['trigger_type']
    if 'trigger_value' in data:
        trigger.trigger_value = json.dumps(data['trigger_value']) if isinstance(data['trigger_value'], list) else data['trigger_value']
    if 'is_case_sensitive' in data:
        trigger.is_case_sensitive = data['is_case_sensitive']
    db.session.commit()
    return jsonify({"status": "success"})


@app.route('/api/conversations/<int:conv_id>/instances', methods=['GET'])
@login_required
def get_conversation_instances(conv_id):
    """Get all active instances of a conversation."""
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    instances = ConversationInstance.query.filter_by(conversation_id=conv_id, user_id=current_user.id).order_by(ConversationInstance.last_activity_at.desc()).all()
    return jsonify([{
        "id": i.id,
        "phone": i.phone,
        "status": i.status,
        "current_step_id": i.current_step_id,
        "started_at": i.started_at.isoformat() + "Z" if i.started_at else None,
        "last_activity_at": i.last_activity_at.isoformat() + "Z" if i.last_activity_at else None,
    } for i in instances])


@app.errorhandler(404)
def handle_404(e):
    return jsonify({"status": "error", "message": "Resource not found in Matrix"}), 404

@app.route('/api/templates/<int:id>', methods=['PUT', 'DELETE'])
@login_required
def single_template(id):
    tpl = Template.query.filter_by(id=id, user_id=current_user.id).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(tpl); db.session.commit(); return jsonify({"status": "success"})
    data = request.json
    tpl.title = data.get('title', tpl.title); tpl.body = data.get('body', tpl.body); tpl.category = data.get('category', tpl.category)
    db.session.commit(); return jsonify({"status": "success"})
    
# Check that this route exists and is spelled exactly like this
@app.route('/api/templates/ai-generate', methods=['POST'])
@login_required
def generate_ai_template():
    user_prompt = request.json.get('prompt')
    if not user_prompt: return jsonify({"message": "Required"}), 400
    try:
        response = requests.post(N8N_WEBHOOK_URL, json={"prompt": user_prompt}, timeout=15)
        raw_data = response.json()
        inner_text = (raw_data[0] if isinstance(raw_data, list) else raw_data).get('content', {}).get('parts', [{}])[0].get('text', "")
        ai_data = json.loads(re.sub(r'```(?:json)?\n?|\n?```', '', inner_text).strip())
        new_tpl = Template(title=ai_data.get('title', 'AI'), body=ai_data.get('body', ''), category=str(ai_data.get('category', 'General')).lower(), user_id=current_user.id)
        db.session.add(new_tpl); db.session.commit()
        return jsonify({"status": "success", "template": {"id": new_tpl.id, "title": new_tpl.title, "body": new_tpl.body}}), 201
    except Exception as e: return jsonify({"message": str(e)}), 500
    
@app.route('/api/ai-assist', methods=['POST'])
@login_required
def ai_assist_forge():
    data = request.json
    user_prompt = data.get('prompt')
    
    if not user_prompt:
        return jsonify({"output": "No prompt provided."}), 400

    try:
        FORGE_WEBHOOK = os.getenv("N8N_FORGE_URL", "http://n8n:5678/webhook/buildesk-forge")
        response = requests.post(FORGE_WEBHOOK, json={"prompt": user_prompt}, timeout=15)

        if response.status_code == 200:
            raw_data = response.json()
            
            # --- TACTICAL EXTRACTION LOGIC ---
            # 1. Get the first object from the array [ {...} ]
            packet = raw_data[0] if isinstance(raw_data, list) else raw_data
            
            # 2. Drill down: content -> parts -> [0] -> text
            try:
                ai_text = packet.get('content', {}).get('parts', [{}])[0].get('text', "")
                
                # 3. Fallback check if the above drill fails
                if not ai_text:
                    ai_text = packet.get('output', packet.get('text', "AI generated an empty response."))
                
                return jsonify({"output": ai_text})
                
            except (KeyError, IndexError, AttributeError):
                return jsonify({"output": "The Matrix returned an unreadable data format."})
        else:
            return jsonify({"output": "Forge Offline (502)."}), 502
            
    except Exception as e:
        return jsonify({"output": f"Proxy Trace Error: {str(e)}"}), 500


# --- SCHEDULER ---
# --- SCHEDULER: SINGLE DISPATCH ---
@app.route('/api/schedule', methods=['GET', 'POST'])
@login_required
def manage_schedules():
    if request.method == 'POST':
        data = request.json
        
        # 1. PARSE IST TIME: React sends "YYYY-MM-DDTHH:MM"
        # We parse it as a naive datetime which our worker now treats as IST
        dt_str = data.get('time').replace('Z', '')
        dt_ist = datetime.fromisoformat(dt_str)
        
        # 2. SANITIZE RECIPIENT
        phone = sanitize_phone(data.get('phone'))
        
        # 3. RECURRENCE (optional)
        recurrence_type = (data.get('recurrence_type') or 'once').strip() or 'once'
        recurrence_config = data.get('recurrence_config')
        if recurrence_config is not None and not isinstance(recurrence_config, str):
            recurrence_config = json.dumps(recurrence_config)
        
        # 4. COMMIT TO VAULT
        new_task = ScheduledMessage(
            phone=phone, 
            content=data.get('message'), 
            scheduled_time=dt_ist,
            status="PENDING",
            user_id=current_user.id,
            recurrence_type=recurrence_type,
            recurrence_config=recurrence_config,
        )
        db.session.add(new_task)
        db.session.commit()
        
        return jsonify({
            "status": "success", 
            "message": "Protocol Queued in IST Matrix", 
            "id": new_task.id
        })

    # GET: Return all logs for current operator (ensure recurrence columns exist)
    _ensure_scheduled_message_recurrence_columns()
    try:
        tasks = ScheduledMessage.query.filter_by(user_id=current_user.id)\
            .order_by(ScheduledMessage.scheduled_time.desc()).all()
    except OperationalError:
        _ensure_scheduled_message_list_columns()
        _ensure_scheduled_message_recurrence_columns()
        tasks = ScheduledMessage.query.filter_by(user_id=current_user.id)\
            .order_by(ScheduledMessage.scheduled_time.desc()).all()

    return jsonify([{
        "id": t.id,
        "phone": t.phone,
        "content": t.content,
        "time": t.scheduled_time.strftime('%Y-%m-%d %H:%M'),
        "status": t.status,
        "list_id": getattr(t, "list_id", None),
        "list_title": getattr(t, "list_title", None),
        "recurrence_type": getattr(t, "recurrence_type", None) or "once",
        "recurrence_config": getattr(t, "recurrence_config", None),
    } for t in tasks])

# --- SCHEDULER: SEGMENT BROADCAST ---
@app.route('/api/schedule/batch', methods=['POST'])
@login_required
def create_batch_schedule():
    data = request.json
    list_id = data.get('listId')
    message_content = data.get('message')
    
    # 1. PARSE IST TIME
    dt_ist = datetime.fromisoformat(data.get('time').replace('Z', ''))
    
    # 2. RECURRENCE (optional)
    recurrence_type = (data.get('recurrence_type') or 'once').strip() or 'once'
    recurrence_config = data.get('recurrence_config')
    if recurrence_config is not None and not isinstance(recurrence_config, str):
        recurrence_config = json.dumps(recurrence_config)
    
    # 3. IDENTIFY TARGET SEGMENT (convert to int if string)
    list_id_int = int(list_id) if isinstance(list_id, str) else list_id
    target_list = List.query.filter_by(id=list_id_int, user_id=current_user.id).first_or_404()
    
    # 4. BULK INJECTION (store list_id and list_title for bulk view)
    for lead in target_list.leads:
        new_task = ScheduledMessage(
            phone=lead.phone,
            content=message_content,
            scheduled_time=dt_ist,
            status="PENDING",
            user_id=current_user.id,
            list_id=target_list.id,
            list_title=target_list.title,
            recurrence_type=recurrence_type,
            recurrence_config=recurrence_config,
        )
        db.session.add(new_task)
    
    db.session.commit() 
    return jsonify({
        "status": "success", 
        "message": f"Broadcast Matrix Authorized: {len(target_list.leads)} IST dispatches queued"
    })

# --- SCHEDULER: UPDATE PROTOCOL ---
@app.route('/api/schedule/<int:id>', methods=['PUT'])
@login_required
def update_schedule(id):
    task = ScheduledMessage.query.filter_by(id=id, user_id=current_user.id).first_or_404()
    
    # Only allow editing PENDING schedules
    if task.status != 'PENDING':
        return jsonify({"status": "error", "message": "Only pending schedules can be edited"}), 400
    
    data = request.json
    
    if 'time' in data:
        dt_str = data.get('time').replace('Z', '')
        dt_ist = datetime.fromisoformat(dt_str)
        task.scheduled_time = dt_ist
    
    if 'message' in data:
        task.content = data.get('message')
    
    if 'phone' in data:
        task.phone = sanitize_phone(data.get('phone'))
    
    db.session.commit()
    return jsonify({
        "status": "success", 
        "message": "Schedule updated",
        "id": task.id,
        "phone": task.phone,
        "content": task.content,
        "time": task.scheduled_time.strftime('%Y-%m-%d %H:%M'),
        "status": task.status
    })

# --- SCHEDULER: DELETE PROTOCOL ---
@app.route('/api/schedule/<int:id>', methods=['DELETE'])
@login_required
def delete_schedule(id):
    task = ScheduledMessage.query.filter_by(id=id, user_id=current_user.id).first_or_404()
    db.session.delete(task)
    db.session.commit()
    return jsonify({"status": "success", "message": "Protocol purged"})

# --- SCHEDULER: FORCE PROTOCOL (RETRY) ---
@app.route('/api/schedule/retry/<int:id>', methods=['POST'])
@login_required
def retry_schedule(id):
    # Retrieve specific task
    task = ScheduledMessage.query.filter_by(id=id, user_id=current_user.id).first_or_404()
    
    try:
        # TACTICAL: Immediate Direct WAHA Dispatch (Mirroring Worker Logic)
        chat_id = f"{task.phone}@c.us"
        
        # Interpolate template variables (e.g., {{name}})
        interpolated_content = interpolate_message(task.content, task.phone, task.user_id)
        
        payload = {
            "chatId": chat_id,
            "text": interpolated_content,
            "session": get_waha_default_session(task.user_id)
        }
        headers = {"X-Api-Key": WAHA_KEY}
        
        response = requests.post(f"{WAHA_API}/api/sendText", json=payload, headers=headers, timeout=10)
        
        if response.status_code in [200, 201]:
            task.status = 'SENT'
            # Update local conversation history
            db.session.add(Message(
                phone=task.phone, 
                content=interpolated_content, 
                is_from_me=True, 
                user_id=task.user_id,
                timestamp=datetime.utcnow() # Logs stay UTC for global sorting
            ))
            db.session.commit()
            return jsonify({"status": "success", "message": "Manual override successful"})
        else:
            task.status = 'FAILED'
            db.session.commit()
            return jsonify({"status": "error", "message": "WAHA link rejected dispatch"}), 400
            
    except Exception as e:
        task.status = 'FAILED'
        db.session.commit()
        return jsonify({"status": "error", "message": f"Critical Error: {str(e)}"}), 500


@app.route('/api/session/status', methods=['GET'])
@login_required
def session_status():
    """Return list of WAHA sessions and the app's default session name."""
    try:
        r = requests.get(f"{WAHA_API}/api/sessions/", headers={"X-Api-Key": WAHA_KEY}, timeout=2)
        sessions = r.json() if r.ok else []
        if not isinstance(sessions, list):
            sessions = [sessions] if sessions else []
        return jsonify({"sessions": sessions, "defaultSession": get_waha_default_session(current_user.id)})
    except Exception:
        return jsonify({"sessions": [], "defaultSession": get_waha_default_session(current_user.id)})


# --- WAHA SESSION MANAGEMENT (proxy to WAHA Plus API) ---
def _waha_headers():
    return {"X-Api-Key": WAHA_KEY, "Content-Type": "application/json", "Accept": "application/json"}


@app.route('/api/waha/sessions', methods=['GET'])
@login_required
@admin_required
def waha_list_sessions():
    """List all WAHA sessions."""
    try:
        r = requests.get(f"{WAHA_API}/api/sessions/", headers=_waha_headers(), timeout=5)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/sessions', methods=['POST'])
@login_required
@admin_required
def waha_create_session():
    """Create a new WAHA session (body: name?, config?, start?)."""
    try:
        data = request.get_json() or {}
        r = requests.post(f"{WAHA_API}/api/sessions/", json=data, headers=_waha_headers(), timeout=15)
        r.raise_for_status()
        return jsonify(r.json())
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": e.response.text if e.response else str(e)}), e.response.status_code if e.response else 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/sessions/<session_name>', methods=['GET'])
@login_required
@admin_required
def waha_get_session(session_name):
    try:
        r = requests.get(f"{WAHA_API}/api/sessions/{session_name}", headers=_waha_headers(), timeout=5)
        r.raise_for_status()
        return jsonify(r.json())
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": e.response.text if e.response else str(e)}), e.response.status_code if e.response else 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/sessions/<session_name>/start', methods=['POST'])
@login_required
@admin_required
def waha_start_session(session_name):
    try:
        r = requests.post(f"{WAHA_API}/api/sessions/{session_name}/start", headers=_waha_headers(), timeout=15)
        r.raise_for_status()
        return jsonify(r.json())
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": e.response.text if e.response else str(e)}), e.response.status_code if e.response else 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/sessions/<session_name>/stop', methods=['POST'])
@login_required
@admin_required
def waha_stop_session(session_name):
    try:
        r = requests.post(f"{WAHA_API}/api/sessions/{session_name}/stop", headers=_waha_headers(), timeout=10)
        r.raise_for_status()
        return jsonify(r.json())
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": e.response.text if e.response else str(e)}), e.response.status_code if e.response else 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/sessions/<session_name>/restart', methods=['POST'])
@login_required
@admin_required
def waha_restart_session(session_name):
    try:
        r = requests.post(f"{WAHA_API}/api/sessions/{session_name}/restart", headers=_waha_headers(), timeout=15)
        r.raise_for_status()
        return jsonify(r.json())
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": e.response.text if e.response else str(e)}), e.response.status_code if e.response else 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/sessions/<session_name>', methods=['DELETE'])
@login_required
@admin_required
def waha_delete_session(session_name):
    try:
        r = requests.delete(f"{WAHA_API}/api/sessions/{session_name}", headers=_waha_headers(), timeout=10)
        r.raise_for_status()
        return jsonify({"status": "ok"})
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": e.response.text if e.response else str(e)}), e.response.status_code if e.response else 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/sessions/<session_name>/qr', methods=['GET'])
@login_required
@admin_required
def waha_session_qr(session_name):
    """Get QR code for session (image or base64)."""
    try:
        qs = request.query_string.decode() if request.query_string else ""
        url = f"{WAHA_API}/api/{session_name}/auth/qr"
        if qs:
            url += "?" + qs
        r = requests.get(url, headers={"X-Api-Key": WAHA_KEY}, timeout=5)
        r.raise_for_status()
        if "application/json" in (request.headers.get("Accept") or ""):
            return jsonify(r.json())
        return r.content, 200, {"Content-Type": r.headers.get("Content-Type", "image/png")}
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/sessions/<session_name>/screenshot', methods=['GET'])
@login_required
@admin_required
def waha_session_screenshot(session_name):
    try:
        r = requests.get(f"{WAHA_API}/api/screenshot?session={session_name}", headers={"X-Api-Key": WAHA_KEY}, timeout=5)
        r.raise_for_status()
        return r.content, 200, {"Content-Type": r.headers.get("Content-Type", "image/png")}
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/waha/default-session', methods=['GET'])
@login_required
def waha_get_default_session():
    return jsonify({"session": get_waha_default_session(current_user.id)})


@app.route('/api/waha/default-session', methods=['PUT'])
@login_required
@admin_required
def waha_set_default_session():
    data = request.get_json() or {}
    name = (data.get("session") or "").strip()
    if not name:
        return jsonify({"error": "session name required"}), 400
    _ensure_settings_table()
    key = f"waha_default_session_user_{current_user.id}"
    s = Setting.query.filter_by(key=key).first()
    if s:
        s.value = name
    else:
        s = Setting(key=key, value=name)
        db.session.add(s)
    db.session.commit()
    return jsonify({"session": name})


# --- ADMIN ROUTES ---
@app.route('/api/admin/create-user', methods=['POST'])
@login_required
def create_user():
    if current_user.username.lower().strip() != 'admin': return jsonify({"status": "error"}), 403
    data = request.json
    hashed = bcrypt.generate_password_hash(data.get('password')).decode('utf-8')
    db.session.add(User(username=data.get('username'), password=hashed))
    db.session.commit(); return jsonify({"status": "success"}), 201

@app.route('/api/admin/users', methods=['GET'])
@login_required
def list_users():
    if current_user.username.lower().strip() != 'admin': return jsonify({"status": "error"}), 403
    users = []
    for u in User.query.all():
        users.append({
            "id": u.id,
            "username": u.username,
            "assigned_session": get_waha_default_session(u.id),
        })
    return jsonify(users)


@app.route('/api/admin/users/<int:user_id>/default-session', methods=['PUT'])
@login_required
def admin_set_user_default_session(user_id):
    """Admin only: assign a WAHA session to a user. Body: { \"session\": \"session_name\" }."""
    if current_user.username.lower().strip() != 'admin':
        return jsonify({"status": "error", "message": "Admin only"}), 403
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"status": "error", "message": "User not found"}), 404
    data = request.get_json() or {}
    name = (data.get("session") or "").strip()
    if not name:
        return jsonify({"status": "error", "message": "session name required"}), 400
    _ensure_settings_table()
    key = f"waha_default_session_user_{user_id}"
    s = Setting.query.filter_by(key=key).first()
    if s:
        s.value = name
    else:
        s = Setting(key=key, value=name)
        db.session.add(s)
    db.session.commit()
    return jsonify({"status": "success", "assigned_session": name})


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    if current_user.username.lower().strip() != 'admin': return jsonify({"status": "error"}), 403
    user = db.session.get(User, user_id)
    if not user or user.username == 'admin': return jsonify({"status": "error"}), 400
    db.session.delete(user); db.session.commit()
    return jsonify({"status": "success"})

def _ensure_call_report_columns():
    """Add url/score columns to call_report if missing (e.g. existing DBs)."""
    try:
        with db.engine.connect() as conn:
            for col, typ in [("url", "VARCHAR(500)"), ("score", "VARCHAR(20)")]:
                try:
                    conn.execute(sql_text(f"ALTER TABLE call_report ADD COLUMN {col} {typ}"))
                    conn.commit()
                except Exception as e:
                    if "duplicate column" not in str(e).lower():
                        raise
    except Exception as e:
        print(f"Call report migration skip: {e}")


def _ensure_scheduled_message_list_columns():
    """Add list_id/list_title to scheduled_message if missing (e.g. existing DBs)."""
    try:
        with db.engine.connect() as conn:
            for col, typ in [("list_id", "INTEGER"), ("list_title", "VARCHAR(200)")]:
                try:
                    conn.execute(sql_text(f"ALTER TABLE scheduled_message ADD COLUMN {col} {typ}"))
                    conn.commit()
                except Exception as e:
                    if "duplicate column" not in str(e).lower():
                        raise
    except Exception as e:
        print(f"Scheduled message migration skip: {e}")


def _ensure_scheduled_message_recurrence_columns():
    """Add recurrence_type/recurrence_config to scheduled_message if missing."""
    try:
        with db.engine.connect() as conn:
            for col, typ in [("recurrence_type", "VARCHAR(30)"), ("recurrence_config", "TEXT")]:
                try:
                    conn.execute(sql_text(f"ALTER TABLE scheduled_message ADD COLUMN {col} {typ}"))
                    conn.commit()
                except Exception as e:
                    if "duplicate column" not in str(e).lower():
                        raise
    except Exception as e:
        print(f"Scheduled message recurrence migration skip: {e}")


def get_next_recurrence_time(current_dt, recurrence_type, recurrence_config):
    """
    Compute next run time from current_dt. recurrence_config is a dict (from JSON).
    Returns None if no next (e.g. once) or invalid config.
    days_of_week: 0=Sun, 1=Mon, ..., 6=Sat (user-facing). Python weekday: Mon=0, ..., Sun=6.
    """
    if not recurrence_type or recurrence_type == "once":
        return None
    try:
        config = recurrence_config if isinstance(recurrence_config, dict) else (json.loads(recurrence_config or "{}"))
    except Exception:
        return None
    from datetime import timedelta
    if recurrence_type == "daily":
        return current_dt + timedelta(days=1)
    if recurrence_type == "every_n_days":
        n = int(config.get("interval_days", 1))
        if n < 1:
            n = 1
        return current_dt + timedelta(days=n)
    if recurrence_type == "hourly":
        interval = int(config.get("interval_hours", 1))
        if interval < 1:
            interval = 1
        return current_dt + timedelta(hours=interval)
    if recurrence_type == "weekly":
        # config["days_of_week"] = [0,4] = Sun, Thu. API: 0=Sun, 1=Mon,..., 6=Sat
        days = config.get("days_of_week", [])
        if not days:
            return current_dt + timedelta(days=7)
        # Python weekday: Mon=0,..., Sun=6. API: Sun=0 -> 6, Mon=1 -> 0, ...
        def api_to_python(d):
            return 6 if int(d) == 0 else int(d) - 1
        python_days = [api_to_python(d) for d in days]
        base_time = current_dt.time()
        # Start from next day; find next date whose weekday is in python_days
        next_date = current_dt.date() + timedelta(days=1)
        for _ in range(8):
            if next_date.weekday() in python_days:
                from datetime import datetime as dt_class
                return dt_class.combine(next_date, base_time)
            next_date += timedelta(days=1)
        return None
    return None


def _ensure_conversation_tables():
    """Ensure conversation tables exist (for existing DBs)."""
    try:
        db.create_all()
    except Exception as e:
        print(f"Conversation tables migration skip: {e}")


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        _ensure_call_report_columns()
        _ensure_scheduled_message_list_columns()
        _ensure_scheduled_message_recurrence_columns()
        _ensure_conversation_tables()
        _ensure_settings_table()
        _ensure_lead_unread_column()
        _ensure_message_media_columns()
        if not User.query.filter_by(username='admin').first():
            admin_pw = bcrypt.generate_password_hash('buildesk').decode('utf-8')
            db.session.add(User(username='admin', password=admin_pw))
            db.session.commit()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))