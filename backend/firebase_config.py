import firebase_admin
from firebase_admin import credentials, firestore, auth
from google.cloud.firestore import ArrayUnion

# Path to your Firebase service account key
cred = credentials.Certificate('firebase-key.json')
firebase_admin.initialize_app(cred)

# Get Firestore client
db = firestore.client()

# Make ArrayUnion available
firestore.ArrayUnion = ArrayUnion

print("Firebase initialized successfully!")