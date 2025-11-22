from flask import Flask, request, jsonify
from flask_cors import CORS
import random
import os
import time

app = Flask(__name__)
# Allow all origins for development purposes.
# For production, you should restrict this to your frontend's domain.
CORS(app)

@app.route('/audio', methods=['POST'])
def handle_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file in request'}), 400

    audio_file = request.files['audio']
    
    # You can save the chunk to inspect it
    # filename = f"audio_chunks/{audio_file.filename}"
    # audio_file.save(filename)
    
    print(f"Received audio chunk: {audio_file.filename}")

    # Randomly classify the audio
    classification = random.choice(['HUMAN', 'AI'])
    time.sleep(2)
    print(f"Classification: {classification}")

    return jsonify({'classification': classification})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3001, debug=True)
