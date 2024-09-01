import React, { ReactElement, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Texture } from 'three';
import { BackgroundRenderer, Background, loadImage, TransitionType, EffectType, Easings, WipeDirection, SlideDirection } from '../dist/midori';
import { io } from 'socket.io-client';


function getTransitionConfig(type: TransitionType) {
  switch (type) {
    case TransitionType.Blend:
      return {
        duration: 1.5,
        easing: Easings.Quartic.InOut,
      };
    case TransitionType.Wipe:
      return {
        duration: 1.5,
        easing: Easings.Quartic.InOut,
        gradient: 0.5,
        angle: 15,
        direction: WipeDirection[Object.keys(WipeDirection)[Math.floor(Math.random() * Object.keys(WipeDirection).length)]],
      };
    case TransitionType.Blur:
      return {
        duration: 1,
        easing: Easings.Quintic.InOut,
        intensity: 1.5,
      };
    case TransitionType.Slide:
      return {
        duration: 1.5,
        easing: Easings.Quintic.InOut,
        slides: 2,
        intensity: 5,
        direction: SlideDirection[Object.keys(SlideDirection)[Math.floor(Math.random() * Object.keys(SlideDirection).length)]],
      };
    case TransitionType.Glitch:
      return {
        seed: Math.random(),
        duration: 1.5,
        easing: Easings.Cubic.InOut,
      };
    default:
      return {};
  }
}

function setBackgroundEffects(background: Background, effects: EffectType[]) {
  const { effects: backgroundEffects } = background;
  // backgroundEffects.removeAll();

  // 直接清除所有的effects会导致网页闪烁，改为下面的方式
  const newEffects = new Set(effects);
  for (const effect in EffectType) {
    const effectType = EffectType[effect as keyof typeof EffectType];

    if (!newEffects.has(effectType)) {
      // 删除在 backgroundEffects 中存在但不在 newEffects 中的效果
      if (backgroundEffects.hasEffect(effectType)) {
        backgroundEffects.remove(effectType);
        console.log(`${effectType} removed`);
      }
    }
  }

  for (const effect of effects) {
    switch (effect) {
      case EffectType.Blur:
        backgroundEffects.set(EffectType.Blur, { radius: 1.5, passes: 2 });
        break;
      case EffectType.MotionBlur:
        backgroundEffects.set(EffectType.MotionBlur, { intensity: 1, samples: 32 });
        break;
      case EffectType.Bloom:
        backgroundEffects.set(EffectType.Bloom, { radius: 1, passes: 2 });
        break;
      case EffectType.RgbShift:
        backgroundEffects.set(EffectType.RgbShift, { amount: 0.005, angle: 135 });
        break;
      case EffectType.Vignette:
        backgroundEffects.set(EffectType.Vignette, { darkness: 1, offset: 1 });
        break;
      case EffectType.VignetteBlur:
        backgroundEffects.set(EffectType.VignetteBlur, { size: 3, radius: 1.5, passes: 2 });
        break;
    }
  }
}

function setBackgroundParticles(background: Background) {
  const { particles } = background;
  particles.generate([
    {
      name: 'small',
      amount: 200,
      maxSize: 5,
      maxOpacity: 0.8,
      minGradient: 0.75,
      maxGradient: 1.0,
    },
    {
      name: 'medium',
      amount: 50,
      maxSize: 12,
      maxOpacity: 0.8,
      minGradient: 0.75,
      maxGradient: 1.0,
      smoothing: 0.8,
    },
    {
      name: 'large',
      amount: 30,
      minSize: 100,
      maxSize: 125,
      maxOpacity: 0.04,
      minGradient: 1.0,
      maxGradient: 1.0,
      smoothing: 0.65,
    },
  ]);
  particles.move('small', { distance: 0.5, angle: 25 }, { duration: 5, loop: true });
  particles.move('medium', { distance: 0.3, angle: 45 }, { duration: 5, loop: true });
  particles.move('large', { distance: 0.4, angle: 35 }, { duration: 5, loop: true });
  particles.sway('small', { x: 0.025, y: 0.025 }, { duration: 1.5, easing: Easings.Sinusoidal.InOut, loop: true });
  particles.sway('medium', { x: 0.025, y: 0.025 }, { duration: 1.5, easing: Easings.Sinusoidal.InOut, loop: true });
  particles.sway('large', { x: 0.025, y: 0.025 }, { duration: 1.5, easing: Easings.Sinusoidal.InOut, loop: true });
}

function setRendererBackground(renderer: BackgroundRenderer, background: Texture, transition: TransitionType) {
  const delay = 1.25;
  renderer.setBackground(background, {
    type: transition,
    config: {
      ...getTransitionConfig(transition),
      delay,
      onInit: (prevBackground, nextBackground) => {
        prevBackground.camera.move({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7 }, {
          duration: 2.5,
          easing: Easings.Quartic.In,
        });
        prevBackground.camera.rotate(-5 + Math.random() * 10, {
          duration: 2.5,
          easing: Easings.Quartic.In,
        });
        nextBackground.camera.move({ x: Math.random(), y: Math.random(), z: 0.7 + Math.random() * 0.3 }, {
          duration: 2,
          delay,
          easing: Easings.Quartic.Out,
        });
        nextBackground.camera.sway({ x: 0.1, y: 0.05, z: 0.02, zr: 1 }, {
          duration: 3,
          easing: Easings.Quadratic.InOut,
          loop: true,
        });
        nextBackground.camera.rotate(-5 + Math.random() * 10, {
          duration: 2,
          delay,
          easing: Easings.Quartic.Out,
        });
      },
    }
  });

  setBackgroundParticles(renderer.background);
}

interface Images {
  image: Texture;
  name: string;
}

interface ExampleProps {
  images: Images[];
}

function Example(props: ExampleProps): ReactElement<ExampleProps> {
  const { images } = props;

  const [canvasRef, setCanvasRef] = useState<HTMLCanvasElement | null>(null);
  const [renderer, setRenderer] = useState<BackgroundRenderer>();
  useEffect(() => {
    if (canvasRef !== null) {
      const backgroundRenderer = new BackgroundRenderer(canvasRef);
      setRenderer(backgroundRenderer);
      return () => backgroundRenderer.dispose();
    }
  }, [images, canvasRef]);

  const transitionRef = useRef<TransitionType>(TransitionType.Wipe);
  const [transition, setTransition] = useState<TransitionType>(transitionRef.current);
  useEffect(() => {
    transitionRef.current = transition;
  }, [transition]);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (renderer !== undefined) {
      setRendererBackground(renderer, images[index].image, transitionRef.current);
    }
  }, [images, index, renderer]);

  const [effects, setEffects] = useState<EffectType[]>([ EffectType.Bloom, EffectType.MotionBlur, EffectType.Vignette, EffectType.VignetteBlur ]);
  useEffect(() => {
    if (renderer !== undefined) {
      setBackgroundEffects(renderer.background, effects);
    }
  }, [effects, index, renderer]);

  useEffect(() => {
    const socket = io();  // 初始化 socket.io 客户端
  
    socket.on('api_next', () => {
      onNextBackground();
    });

    socket.on('api_prev', () => {
      onPrevBackground();
    });

    socket.on('api_goto', (image_name: string) => {
      onGotoBackgrond(image_name);
    });

    socket.on('api_config', (data: { transition: TransitionType, effects: EffectType[] }) => {
      const { transition, effects } = data;
      
      // 如果 transition 不为空，调用 onTransitionSet(transition);
      if (transition) {
        console.log(`transition: ${transition}`);
        setTransition(transition);
      }
      
      // 如果 effects 不为空，调用 setEffects(effects);
      if (effects.length > 0) {
        console.log(`effects: ${effects}`);
        setEffects(effects);
      }
    });
  
    return () => {
      socket.disconnect();  // 在组件卸载时断开连接
    };
  }, [renderer, index]);  // 确保当 renderer 或 index 改变时重新挂载事件


  // 切换到下一张背景图片
  const onNextBackground = () => {
    if (renderer !== undefined && !renderer.isTransitioning()) {
      setIndex((index + 1) % images.length);
    }
  };

  // 切换到上一张背景图片
  const onPrevBackground = () => {
    if (renderer !== undefined && !renderer.isTransitioning()) {
      setIndex(index - 1 < 0 ? images.length - 1 : index - 1);
    }
  };

  // 切换到指定的背景图片
  const onGotoBackgrond = (name: string) => {
    if (renderer !== undefined && !renderer.isTransitioning()) {
      const goto = images.findIndex(img => img.name === name);
      if (index !== goto) {
        setIndex(goto);
      }
    }
  };

  // 控制摄像机的移动效果
  const onCameraMove = () => {
    if (renderer !== undefined) {
      const { camera } = renderer.background;
      if (!camera.isMoving() && !camera.isRotating()) {
        camera.move({ x: Math.random(), y: Math.random(), z: 0.5 + Math.random() * 0.5 }, {
          duration: 2.5,
          easing: Easings.Cubic.InOut,
        });
        camera.rotate(-5 + Math.random() * 10, {
          duration: 2.5,
          easing: Easings.Cubic.InOut,
        });
      }
    }
  };

  return (
    <>
      <canvas ref={setCanvasRef} className='canvas'/>
    </>
  );
}

// 获取图像文件名列表并加载图像
fetch('/api/images')
  .then(response => response.json())
  .then(imageFiles => {
    // 创建图像加载的 Promise 数组
    const imagePromises = imageFiles.map(file => 
      loadImage(`assets/${file}`).then(image => ({
        image,
        name: file
      }))
    );

    // 等待所有图像加载完成
    return Promise.all(imagePromises);
  })
  .then(images => {
    // 渲染组件
    ReactDOM.render(<Example images={images} />, document.getElementById('root'));
  })
  .catch(e => console.error(`Failed to load assets: ${e}`));