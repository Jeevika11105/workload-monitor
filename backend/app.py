from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import random
import string
from datetime import datetime
import hashlib
import os  # ADDED: for production port handling

app = Flask(__name__)
CORS(app)  # This allows frontend to call backend

# Initialize Firebase (only once)
# Check if running on Render (production) or local
import os
import json

if not firebase_admin._apps:
    firebase_json = os.environ.get("FIREBASE_KEY")

    if firebase_json:
        # Running on Render
        cred_dict = json.loads(firebase_json)
        cred = credentials.Certificate(cred_dict)
    else:
        # Running locally
        cred = credentials.Certificate('firebase-key.json')

    firebase_admin.initialize_app(cred)

db = firestore.client()
print("Firebase initialized successfully!")

# ============= WORKLOAD CALCULATION =============
def calculate_workload_score(tasks, hours):
    hours_score = 0
    tasks_score = 0
    
    if hours <= 35:
        hours_score = (hours / 35) * 30
    elif hours <= 45:
        hours_score = 30 + ((hours - 35) / 10) * 30
    elif hours <= 55:
        hours_score = 60 + ((hours - 45) / 10) * 25
    else:
        hours_score = 85 + min(15, (hours - 55) / 5 * 15)
    
    if tasks <= 15:
        tasks_score = (tasks / 15) * 15
    elif tasks <= 25:
        tasks_score = 15 + ((tasks - 15) / 10) * 15
    elif tasks <= 35:
        tasks_score = 30 + ((tasks - 25) / 10) * 10
    else:
        tasks_score = 40
    
    final_score = (hours_score * 0.6) + (tasks_score * 0.4)
    
    if hours > 45 and tasks > 30:
        final_score += 8
    if hours > 50 and tasks > 35:
        final_score += 10
    if hours > 55:
        final_score += 7
    
    return min(100, max(0, round(final_score)))

def get_workload_level(score):
    if score >= 70:
        return "High"
    if score >= 35:
        return "Normal"
    return "Low"

# ============= TEST ROUTE =============
@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({'message': 'Backend is working!'})

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'message': 'AI Workload Monitor API',
        'status': 'running',
        'endpoints': [
            '/api/test',
            '/api/auth/signup',
            '/api/auth/login',
            '/api/teams',
            '/api/teams/join',
            '/api/teams/<team_id>',
            '/api/teams/<team_id>/members'
        ]
    })

# ============= AUTHENTICATION ROUTES =============
@app.route('/api/auth/signup', methods=['POST', 'OPTIONS'])
def signup():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    try:
        data = request.json
        print("Received signup data:", data)
        
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        
        if not name or not email or not password:
            return jsonify({'error': 'Missing name, email, or password'}), 400
        
        # Check if user already exists
        users_ref = db.collection('users')
        query = users_ref.where('email', '==', email).limit(1).get()
        
        if len(list(query)) > 0:
            return jsonify({'error': 'Email already exists'}), 400
        
        # Simple token for demo
        token = hashlib.md5(f"{email}{datetime.now()}".encode()).hexdigest()
        
        # Create user in Firestore
        user_data = {
            'name': name,
            'email': email,
            'password': hashlib.md5(password.encode()).hexdigest(),
            'teams': [],
            'created_at': datetime.now()
        }
        
        user_ref = db.collection('users').document()
        user_ref.set(user_data)
        
        print(f"User created with ID: {user_ref.id}")
        
        return jsonify({
            'token': token,
            'user': {
                'id': user_ref.id,
                'name': name,
                'email': email,
                'teams': []
            }
        })
    except Exception as e:
        print(f"Signup error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    try:
        data = request.json
        print("Received login data:", data)
        
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Missing email or password'}), 400
        
        hashed_password = hashlib.md5(password.encode()).hexdigest()
        
        # Find user by email and password
        users_ref = db.collection('users')
        query = users_ref.where('email', '==', email).where('password', '==', hashed_password).limit(1).get()
        
        if not query:
            return jsonify({'error': 'Invalid credentials'}), 401
        
        user_doc = list(query)[0]
        user_data = user_doc.to_dict()
        
        # Get user's teams with details
        teams = []
        for team_id in user_data.get('teams', []):
            team_doc = db.collection('teams').document(team_id).get()
            if team_doc.exists:
                team_data = team_doc.to_dict()
                teams.append({
                    'id': team_id,
                    'name': team_data.get('name'),
                    'description': team_data.get('description', ''),
                    'join_code': team_data.get('join_code')
                })
        
        token = hashlib.md5(f"{email}{datetime.now()}".encode()).hexdigest()
        
        return jsonify({
            'token': token,
            'user': {
                'id': user_doc.id,
                'name': user_data.get('name'),
                'email': user_data.get('email'),
                'teams': teams
            }
        })
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ============= TEAM ROUTES =============
@app.route('/api/teams', methods=['POST', 'OPTIONS'])
def create_team():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    try:
        data = request.json
        print("Received create team data:", data)
        
        user_id = data.get('user_id')
        team_name = data.get('name')
        description = data.get('description', '')
        
        if not user_id or not team_name:
            return jsonify({'error': 'Missing user_id or team name'}), 400
        
        # Generate random join code
        join_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        
        # Create team in Firestore
        team_data = {
            'name': team_name,
            'description': description,
            'join_code': join_code,
            'created_by': user_id,
            'members': [user_id],
            'members_data': [],
            'created_at': datetime.now()
        }
        
        team_ref = db.collection('teams').document()
        team_ref.set(team_data)
        
        # Add team to user's teams list
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'teams': firestore.ArrayUnion([team_ref.id])
        })
        
        print(f"Team created with ID: {team_ref.id}")
        
        return jsonify({
            'id': team_ref.id,
            'name': team_name,
            'description': description,
            'join_code': join_code,
            'members_data': []
        })
    except Exception as e:
        print(f"Create team error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/teams/join', methods=['POST', 'OPTIONS'])
def join_team():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    try:
        data = request.json
        print("Received join team data:", data)
        
        user_id = data.get('user_id')
        join_code = data.get('join_code')
        
        if not user_id or not join_code:
            return jsonify({'error': 'Missing user_id or join_code'}), 400
        
        # Find team by join code
        teams_ref = db.collection('teams')
        query = teams_ref.where('join_code', '==', join_code.upper()).limit(1).get()
        
        if not query:
            return jsonify({'error': 'Team not found'}), 404
        
        team_doc = list(query)[0]
        team_data = team_doc.to_dict()
        
        # Check if already member
        if user_id in team_data.get('members', []):
            return jsonify({'error': 'Already a member'}), 400
        
        # Add user to team members
        team_doc.reference.update({
            'members': firestore.ArrayUnion([user_id])
        })
        
        # Add team to user's teams list
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'teams': firestore.ArrayUnion([team_doc.id])
        })
        
        return jsonify({
            'id': team_doc.id,
            'name': team_data.get('name'),
            'description': team_data.get('description', ''),
            'join_code': team_data.get('join_code')
        })
    except Exception as e:
        print(f"Join team error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/teams/<team_id>', methods=['GET', 'OPTIONS'])
def get_team(team_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    try:
        team_doc = db.collection('teams').document(team_id).get()
        if not team_doc.exists:
            return jsonify({'error': 'Team not found'}), 404
        
        team_data = team_doc.to_dict()
        
        return jsonify({
            'id': team_doc.id,
            'name': team_data.get('name'),
            'description': team_data.get('description', ''),
            'join_code': team_data.get('join_code'),
            'members_data': team_data.get('members_data', [])
        })
    except Exception as e:
        print(f"Get team error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/teams/<team_id>/members', methods=['POST', 'OPTIONS'])
def add_member(team_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    try:
        data = request.json
        print("Received add member data:", data)
        
        name = data.get('name')
        tasks = float(data.get('tasks', 0))
        hours = float(data.get('hours', 0))
        
        if not name:
            return jsonify({'error': 'Missing member name'}), 400
        
        workload_score = calculate_workload_score(tasks, hours)
        level = get_workload_level(workload_score)
        
        # Generate unique member ID
        member_id = f"member_{int(datetime.now().timestamp())}_{random.randint(1000, 9999)}"
        
        new_member = {
            'id': member_id,
            'name': name,
            'tasks': tasks,
            'hours': hours,
            'workloadScore': workload_score,
            'level': level,
            'created_at': datetime.now()
        }
        
        # Add member to team's members_data
        team_ref = db.collection('teams').document(team_id)
        team_ref.update({
            'members_data': firestore.ArrayUnion([new_member])
        })
        
        return jsonify({
            'id': member_id,
            'name': name,
            'tasks': tasks,
            'hours': hours,
            'workloadScore': workload_score,
            'level': level
        })
    except Exception as e:
        print(f"Add member error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/teams/<team_id>/members/<member_id>', methods=['PUT', 'OPTIONS'])
def update_member(team_id, member_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    try:
        data = request.json
        tasks = float(data.get('tasks'))
        hours = float(data.get('hours'))
        
        workload_score = calculate_workload_score(tasks, hours)
        level = get_workload_level(workload_score)
        
        # Get current team data
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        team_data = team_doc.to_dict()
        members_data = team_data.get('members_data', [])
        
        # Update the specific member
        updated_members = []
        for member in members_data:
            if member.get('id') == member_id:
                member['tasks'] = tasks
                member['hours'] = hours
                member['workloadScore'] = workload_score
                member['level'] = level
                member['updated_at'] = datetime.now()
            updated_members.append(member)
        
        # Save back to Firestore
        team_ref.update({'members_data': updated_members})
        
        return jsonify({'success': True, 'workloadScore': workload_score, 'level': level})
    except Exception as e:
        print(f"Update member error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/teams/<team_id>/members/<member_id>', methods=['DELETE', 'OPTIONS'])
def delete_member(team_id, member_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    try:
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        team_data = team_doc.to_dict()
        members_data = team_data.get('members_data', [])
        
        # Filter out the member to delete
        updated_members = [m for m in members_data if m.get('id') != member_id]
        
        team_ref.update({'members_data': updated_members})
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Delete member error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ============= HEALTH CHECK ROUTE (for Render) =============
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'}), 200

if __name__ == '__main__':
    # Get port from environment variable (for Render) or use 5000 for local
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)