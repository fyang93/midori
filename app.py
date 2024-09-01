from flask import Flask, send_from_directory, request, jsonify
from flask_socketio import SocketIO
import os


app = Flask(__name__, static_folder='docs', static_url_path='/')
socketio = SocketIO(app)
AVAILABLE_TRANSITIONS = ['none', 'blend', 'blur', 'wipe', 'slide', 'glitch']
AVAILABLE_EFFECTS = {
    'blur': 'Blur',
    'bloom': 'Bloom',
    'rgbshift': 'RgbShift',
	'vignette': "Vignette",
	'vignetteblur': "VignetteBlur",
	'motionblur': "MotionBlur",
	'glitch': "Glitch"
}


def get_image_filenames():
    assets_dir = os.path.join(app.static_folder, "assets")
    images = [f for f in sorted(os.listdir(assets_dir))
                  if os.path.splitext(f)[-1] in ['.jpg', '.png', '.webp']]
    return images

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/images')
def list_images():
    return jsonify(get_image_filenames())

@app.route('/api/next', methods=['GET'])
def api_next():
    socketio.emit('api_next', namespace='/')
    return jsonify({"status": f"Go to next background broadcasted"}), 200

@app.route('/api/prev', methods=['GET'])
def api_prev():
    socketio.emit('api_prev', namespace='/')
    return jsonify({"status": f"Go to previous background broadcasted"}), 200

@app.route('/api/goto', methods=['GET'])
def apt_goto():
    image = request.args.get('image')
    if not image:
        return jsonify({'error': 'No image name provided'}), 400

    images = get_image_filenames()
    if image not in images:
        return jsonify({'error': f"Image not listed in {', '.join(images)}"}), 400

    socketio.emit('api_goto', image, namespace='/')
    return jsonify({'status': 'Go to image emitted', 'data': image}), 200

@app.route('/api/config', methods=['GET'])
def api_config():
    transition = request.args.get('transition')
    effects = request.args.getlist('effect')

    invalid_transition = not transition or transition.lower() not in AVAILABLE_TRANSITIONS
    invalid_effects = not effects or any(e.lower() not in AVAILABLE_EFFECTS for e in effects)
    if invalid_transition and invalid_effects:
        return jsonify({"error": f"Available transitions: {', '.join(AVAILABLE_TRANSITIONS)}; Available effects: {', '.join(AVAILABLE_EFFECTS.keys())}"}), 400

    config = {
        'transition': transition.capitalize(),
        'effects': [AVAILABLE_EFFECTS[e.lower()] for e in effects]
    }

    socketio.emit('api_config', config, namespace='/')
    return jsonify({'status': 'Config emitted', 'data': config}), 200

if __name__ == '__main__':
    socketio.run(app, debug=True)