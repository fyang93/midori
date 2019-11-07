
import { PerspectiveCamera, Math as threeMath } from 'three';
import TWEEN from '@tweenjs/tween.js';

/**
 * Returns the visible width at the given depth in world units.
 * @param {Number} absoluteZ - the depth in absolute world units.
 * @param {three.Camera} camera - a three.js camera.
 */
function getVisibleWidthAtDepth(absoluteZ, camera) {
  return getVisibleHeightAtDepth(absoluteZ, camera) * camera.aspect;
}

/**
 * Returns the visible height at the given depth in world units.
 * @param {Number} absoluteZ - the depth in absolute world units.
 * @param {three.Camera} camera - a three.js camera.
 */
function getVisibleHeightAtDepth(absoluteZ, camera) {
  // fov is vertical fov in radians
  return 2 * Math.tan(threeMath.degToRad(camera.fov) / 2) * absoluteZ;
}

/**
 * Returns the maximum depth for an object such that it is still fullscreen.
 * @param {three.Object3D} object - a three.js object.
 * @param {three.Camera} camera - a three.js camera.
 * @param {number} rotateZ - the z-axis rotation angle of the camera in radians.
 */
function getMaxFullScreenDepthForObject(object, camera, rotateZ) {
  // When the camera is rotated, we treat the object as if it were rotated instead and
  // use the width/height of the maximal inner bounded box that fits within the object.
  // This ensures that the maximum depth calculated will always allow for the object to be
  // fullscreen even if rotated.
  // NOTE: if there is no rotation (i.e 0 degs) then the object's width and height will be used as normal.
  const { width, height } = getInnerBoundedBoxForRotation(object, rotateZ);

  const verticalFovConstant = 2 * Math.tan(threeMath.degToRad(camera.fov) / 2);
  const maxDepthForWidth = width / (verticalFovConstant * camera.aspect);
  const maxDepthForHeight = height / verticalFovConstant;

  // NOTE: this depth assumes the camera is centered on the object.
  return Math.min(maxDepthForWidth, maxDepthForHeight) + object.position.z;
}
/**
 * Adapted from https://stackoverflow.com/questions/16702966/rotate-image-and-crop-out-black-borders/16778797#16778797.
 *
 * Given a rectangle of size w x h that has been rotated by 'angle' (in
 * radians), computes the width and height of the largest possible
 * axis-aligned rectangle (maximal area) within the rotated rectangle.
 * @param {three.Object3D} object - a three.js object.
 * @param {number} angleInRadians - the angle to rotate in radians.
 */
function getInnerBoundedBoxForRotation(object, angleInRadians = 0) {
  const { width, height } = object.geometry.parameters;
  const widthIsLonger = width >= height;
  const longSide = widthIsLonger ? width : height;
  const shortSide = widthIsLonger ? height : width;
  const sinAngle = Math.abs(Math.sin(angleInRadians));
  const cosAngle = Math.abs(Math.cos(angleInRadians));

  // since the solutions for angle, -angle and 180-angle are all the same,
  // if suffices to look at the first quadrant and the absolute values of sin,cos:
  if ((shortSide <= 2 * sinAngle * cosAngle * longSide) || (Math.abs(sinAngle - cosAngle) < 1e-10)) {
    // half constrained case: two crop corners touch the longer side,
    // the other two corners are on the mid-line parallel to the longer line
    const x = 0.5 * shortSide;
    return {
      width: widthIsLonger ? x / sinAngle : x / cosAngle,
      height: widthIsLonger ? x / cosAngle : x / sinAngle,
    };
  }

  // fully constrained case: crop touches all 4 sides
  const cosDoubleAngle = cosAngle * cosAngle - sinAngle * sinAngle;
  return {
    width: (width * cosAngle - height * sinAngle) / cosDoubleAngle,
    height: (height * cosAngle - width * sinAngle) / cosDoubleAngle,
  };
}

/**
 * Returns the visible width and height at the given depth in world units.
 * @param {three.Object3D} object - a three.js object.
 * @param {three.Camera} camera - a three.js camera.
 * @param {Number} relativeZ - value between 0 (max zoom-in) and 1 (max zoom-out) that represents the z position.
 * @param {number} rotateZ - the z-axis rotation angle of the camera in radians.
 */
function getViewBox(object, camera, relativeZ, rotateZ) {
  const maxDepth = getMaxFullScreenDepthForObject(object, camera, rotateZ);
  const absoluteDepth = relativeZ * maxDepth;
  return {
    width: getVisibleWidthAtDepth(absoluteDepth, camera),
    height: getVisibleHeightAtDepth(absoluteDepth, camera),
  };
}

/**
 * Returns the available x and y distance a camera can be panned at the given depth in world units.
 * @param {three.Object3D} object - a three.js object.
 * @param {three.Camera} camera - a three.js camera.
 * @param {Number} relativeZ - value between 0 (max zoom-in) and 1 (max zoom-out) that represents the z position.
 * @param {number} rotateZ - the z-axis rotation angle of the camera in radians.
 */
function getAvailablePanDistance(object, camera, relativeZ, rotateZ) {
  const { width, height } = getInnerBoundedBoxForRotation(object, rotateZ);
  const viewBox = getViewBox(object, camera, relativeZ, rotateZ);
  return {
    width: width - viewBox.width,
    height: height - viewBox.height,
  };
}

/**
 * Converts a relative vector to an absolute vector for a given object and camera.
 * @param {three.Object3D} object - a three.js object.
 * @param {three.Camera} camera - a three.js camera.
 * @param {CameraVector} relativePosition - a vector that represents the relative camera position to convert from.
 * The rotation component of the vector MUST be in units of radians.
 */
function toAbsolutePosition(object, camera, relativePosition) {
  const { x, y, z, zr } = relativePosition;

  const panDistance = getAvailablePanDistance(object, camera, z, zr);
  // offset the viewbox's position so that it starts at the top-left corner, then move it
  // based on the relative proportion to the available x and y distance the viewbox can be moved.
  const absoluteX = -(panDistance.width / 2) + (x * panDistance.width);
  const absoluteY = (panDistance.height / 2) - (y * panDistance.height);
  const absoluteDepth = getMaxFullScreenDepthForObject(object, camera, zr) * z;

  return new CameraVector(
    // Make sure to rotate the x/y positions to get the actual correct positions relative to the camera rotation.
    absoluteX * Math.cos(zr) - absoluteY * Math.sin(zr),
    absoluteX * Math.sin(zr) + absoluteY * Math.cos(zr),
    absoluteDepth,
    zr,
  );
}

/**
 * Converts an absolute vector to a relative vector for a given object and camera.
 * @param {three.Object3D} object - a three.js object.
 * @param {three.Camera} camera - a three.js camera.
 * @param {CameraVector} absolutePosition - a vector that represents the absolute camera position to convert from.
 * The rotation component of the vector MUST be in units of radians.
 */
function toRelativePosition(object, camera, absolutePosition) {
  const { x, y, z, zr } = absolutePosition;

  const relativeZ = z / getMaxFullScreenDepthForObject(object, camera, zr);
  const panDistance = getAvailablePanDistance(object, camera, relativeZ, zr);
  const relativeX = (x / panDistance.width) + ((panDistance.width / 2) / panDistance.width);
  const relativeY = panDistance.height === 0 ? 0 : Math.abs((y / panDistance.height) - ((panDistance.height / 2) / panDistance.height));

  // TODO: make this support conversions from rotated absolute positions
  return new CameraVector(relativeX, relativeY, relativeZ, zr);
}

class CameraVector {
  x; // the x-axis component of the vector
  y; // the y-axis component of the vector
  z; // the z-axis component of the vector
  zr; // the z-axis rotation component of the vector

  constructor(x, y, z, zr) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.zr = zr || 0;
  }
}

class BackgroundCamera {
  _object;
  _camera;

  _position = new CameraVector(0, 0, 1, 0); // the current absolute position of the camera
  _positionTransition = new TWEEN.Tween();
  _rotationTransition = new TWEEN.Tween();

  _swayOffset = new CameraVector(0, 0, 0, 0); // the current relative vector offset to sway away from the camera
  _swayDistance = new CameraVector(0, 0, 0, 0); // the current relative distances to sway the camera - cached to loop sways
  _swayTransitionConfig = { loop: true, duration: 1, easing: TWEEN.Easing.Linear.None }; // the current sway transition config - cached to loop sways
  _swayTransition = new TWEEN.Tween();

  constructor(background, width, height, fov = 35) {
    this._object = background.plane;
    this._camera = new PerspectiveCamera(fov, width / height);
  }

  get camera() {
    return this._camera;
  }

  get position() {
    const { x: absoluteX, y: absoluteY, z: absoluteZ } = this._camera.position;
    const rotationZ = this._camera.rotation.z;
    // NOTE: the relative camera position is the unmodified position and does NOT include offsets from swaying.
    return {
      absolute: new CameraVector(absoluteX, absoluteY, absoluteZ, rotationZ),
      relative: toRelativePosition(this._object, this._camera, this._position),
    };
  }

  setSize(width, height) {
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
  }

  /**
   * Sways the camera around its current position repeatedly.
   * @param {CameraVector} relativeDistance - the relative distances allowed on each axis for swaying.
   * The x/y distances should be set based off a z-value of 1 and will be scaled down appropriately based on the camera's current z position.
   * The rotation component of the vector MUST be in units of radians.
   * @param {Object} transition - optional configuration for a transition.
   * @param {Number} transition.loop=true - sway repeatedly in a loop.
   * @param {Number} transition.duration=0 - the duration of the sway in seconds.
   * @param {TWEEN.Easing} transition.easing=TWEEN.Easing.Linear.None - the easing function to use.
   */
  sway(relativeDistance, transition = {}) {
    this._swayTransition.stop();

    this._swayDistance = relativeDistance || this._swayDistance;
    this._swayTransitionConfig = { ...this._swayTransitionConfig, ...transition };
    const { loop, duration, easing } = this._swayTransitionConfig;

    // Relative distances result in shorter sways at high z-values (zoomed-out) and larger sways at low z-values (zoomed-in),
    // so dampen x/y sway based on the camera's current z position.
    const dampeningFactor = this._position.z / 2;

    const { x, y, z, zr } = this._swayDistance;
    const swayMinX = Math.max(0, this._position.x - (x * dampeningFactor));
    const swayMaxX = Math.min(1, this._position.x + (x * dampeningFactor));
    const swayX = Math.random() * (swayMaxX - swayMinX) + swayMinX;
    const swayMinY = Math.max(0, this._position.y - (y * dampeningFactor));
    const swayMaxY = Math.min(1, this._position.y + (y * dampeningFactor));
    const swayY = Math.random() * (swayMaxY - swayMinY) + swayMinY;
    const swayMinZ = Math.max(0, this._position.z - z);
    const swayMaxZ = Math.min(1, this._position.z + z);
    const swayZ = Math.random() * (swayMaxZ - swayMinZ) + swayMinZ;
    const swayZR = Math.random() * zr + (this._position.zr - (zr / 2));

    this._swayTransition = new TWEEN.Tween({
      offsetX: this._swayOffset.x,
      offsetY: this._swayOffset.y,
      offsetZ: this._swayOffset.z,
      offsetZR: this._swayOffset.zr,
    })
      .to({
        offsetX: swayX - this._position.x,
        offsetY: swayY - this._position.y,
        offsetZ: swayZ - this._position.z,
        offsetZR: swayZR - this._position.zr,
      }, duration * 1000)
      .easing(easing)
      .onStart(() => {
        // console.log('sway start');
      })
      .onUpdate(({ offsetX, offsetY, offsetZ, offsetZR }) => {
        this._swayOffset = new CameraVector(offsetX, offsetY, offsetZ, offsetZR);
      })
      .onComplete(() => {
        // console.log('sway end');
        if (loop) {
          this.sway();
        }
      })
      .start();
  }

  /**
   * Rotates the camera on its z-axis.
   * @param {Number} angle - the angle to rotate in radians.
   * @param {Object} transition - optional configuration for a transition.
   * @param {Number} transition.duration=0 - the duration of the rotation in seconds.
   * @param {TWEEN.Easing} transition.easing=TWEEN.Easing.Linear.None - the easing function to use.
   */
  rotate(angle, transition = {}) {
    this._rotationTransition.stop();
    this._rotationTransition = new TWEEN.Tween({ zr: this._position.zr })
      .to({ zr: angle }, (transition.duration || 0) * 1000)
      .easing(transition.easing || TWEEN.Easing.Linear.None)
      .onUpdate(({ zr }) => {
        this._position = new CameraVector(this._position.x, this._position.y, this._position.z, zr);
      })
      .start();
  }

  /**
   * Moves the camera to a relative position on the background.
   * @param {three.Vector3} relativePosition - the relative position to move the camera towards.
   * The x component is a value between 0 and 1 that represents the x position based on the z component.
   * The y component is a value between 0 and 1 that represents the y position based on the z component.
   * The z component is a value between 0 (max zoom-in) and 1 (max zoom-out) that represents the z position.
   * @param {Object} transition - optional configuration for a transition.
   * @param {Number} transition.duration=0 - the duration of the move in seconds.
   * @param {TWEEN.Easing} transition.easing=TWEEN.Easing.Linear.None - the easing function to use.
   */
  move(relativePosition, transition = {}) {
    this._positionTransition.stop();
    this._positionTransition = new TWEEN.Tween({ x: this._position.x, y: this._position.y, z: this._position.z })
      .to({ x: relativePosition.x, y: relativePosition.y, z: relativePosition.z }, (transition.duration || 0) * 1000)
      .easing(transition.easing || TWEEN.Easing.Linear.None)
      .onUpdate(({ x, y, z }) => {
        this._position = new CameraVector(x, y, z, this._position.zr);
      })
      .start();
  }

  /**
   * Updates the camera position. Should be called on every render frame.
   */
  update() {
    const { x: absoluteX, y: absoluteY, z: absoluteDepth } = toAbsolutePosition(
      this._object,
      this._camera,
      new CameraVector(
        // Ensure that the position is always valid despite sway.
        // Moving the camera in-between ongoing sway cycles does not always guarantee the validity of the position, so coercion is required.
        Math.min(1, Math.max(0, this._position.x + this._swayOffset.x)),
        Math.min(1, Math.max(0, this._position.y + this._swayOffset.y)),
        Math.min(1, Math.max(0, this._position.z + this._swayOffset.z)),
        this._position.zr + this._swayOffset.zr,
      ),
    );

    this._camera.position.set(absoluteX, absoluteY, absoluteDepth);
    this._camera.rotation.z = this._position.zr + this._swayOffset.zr;
    this._camera.updateProjectionMatrix();
  }
}

export {
  CameraVector,
  BackgroundCamera,
};

export default BackgroundCamera;
