import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface CameraViewProps {
  onFrame?: (imageData: ImageData) => void;
  className?: string;
  videoRef?: React.RefObject<HTMLVideoElement>;
  facingMode?: 'user' | 'environment';
}

const CameraView: React.FC<CameraViewProps> = ({
  onFrame,
  className,
  videoRef: externalVideoRef,
  facingMode = 'environment',
}) => {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const startingCameraRef = useRef<boolean>(false);
  // Bumped on every startCamera() call. An invocation that resumes from an
  // await with a stale generation has been superseded by a newer one and must
  // not touch state — otherwise a superseded attempt reports its own abort as
  // a camera failure over a camera that is, by then, running fine.
  const cameraGenerationRef = useRef<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  // Retry attempts are control flow, never rendered. As state it landed in
  // startCamera's dependency array, so setRetryCount(0) on success changed the
  // callback identity, re-fired the facingMode effect, and restarted the camera
  // in a loop that aborted its own play(). A ref breaks that cycle.
  const retryCountRef = useRef(0);
  const [lastRetryTime, setLastRetryTime] = useState(0);
  // False when the failure is environmental (insecure origin, unsupported
  // browser) and retrying can never succeed without reloading the page.
  const [canRetry, setCanRetry] = useState(true);
  const isMobile = useIsMobile();

  // Use external ref if provided, otherwise use internal ref
  const videoReference = externalVideoRef || internalVideoRef;

  // Clean up function to properly stop stream and animation
  const cleanupCamera = useCallback(() => {
    // Cancel any pending animation frame
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Stop all tracks in the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Reset video element
    if (videoReference.current && videoReference.current.srcObject) {
      videoReference.current.srcObject = null;
    }

    setIsActive(false);
  }, [videoReference]);

  // Process video frames when camera is active
  const processVideoFrames = useCallback(() => {
    if (!videoReference.current || !canvasRef.current || !onFrame) return;

    // This canvas is read back with getImageData on every animation frame, so
    // keep its buffer in system memory rather than round-tripping the GPU.
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Make sure video is actually playing and has dimensions
    if (
      videoReference.current.readyState < 2 ||
      !videoReference.current.videoWidth ||
      !videoReference.current.videoHeight
    ) {
      // Video not ready yet, try again in the next frame
      animationRef.current = requestAnimationFrame(processVideoFrames);
      return;
    }

    // Set canvas dimensions to match video
    canvasRef.current.width = videoReference.current.videoWidth;
    canvasRef.current.height = videoReference.current.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(
      videoReference.current,
      0,
      0,
      videoReference.current.videoWidth,
      videoReference.current.videoHeight,
    );

    try {
      // Get image data from canvas
      const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);

      // Pass image data to callback
      onFrame(imageData);
    } catch (err) {
      console.error('Error processing frame:', err);
      // Don't set error state here to avoid interrupting the camera feed
    }

    // Continue processing frames
    animationRef.current = requestAnimationFrame(processVideoFrames);
  }, [onFrame, videoReference]);

  // Start the camera
  const startCamera = useCallback(async () => {
    // Prevent multiple simultaneous camera start attempts
    if (startingCameraRef.current) {
      console.log('Camera start already in progress, skipping request');
      return;
    }

    // Set flag to indicate camera start in progress
    startingCameraRef.current = true;
    const generation = ++cameraGenerationRef.current;

    // Clean up any existing camera resources
    cleanupCamera();

    // Show loading state
    setIsLoading(true);
    setError(null);

    // getUserMedia only exists in a secure context. Served over plain HTTP on
    // a LAN address, `navigator.mediaDevices` is undefined outright — calling
    // it throws an opaque TypeError rather than a permission error, which then
    // gets reported to the user as "Cannot read properties of undefined".
    // Check the precondition so the message names the actual problem.
    if (!navigator.mediaDevices?.getUserMedia) {
      const insecureOrigin = !window.isSecureContext;
      setError(
        insecureOrigin
          ? `Camera blocked: ${window.location.origin} is not a secure origin. Browsers only allow camera access over HTTPS or on localhost.`
          : 'This browser does not support camera access (getUserMedia is unavailable).',
      );
      setCanRetry(false);
      setIsLoading(false);
      startingCameraRef.current = false;
      return;
    }

    try {
      // Try to get access to the camera with the requested facing mode
      const mobileFacingMode = isMobile ? facingMode : 'environment';

      // Use portrait/vertical orientation for all devices
      const constraints = {
        video: {
          facingMode: isMobile ? mobileFacingMode : facingMode,
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: false,
      };

      console.log(
        `Attempting to access camera with mode: ${isMobile ? mobileFacingMode : facingMode}`,
      );
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // A newer startCamera() began while we were awaiting permission. Drop
      // this stream rather than racing the newer one onto the video element.
      if (generation !== cameraGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // Store stream in ref for cleanup
      streamRef.current = stream;

      if (videoReference.current) {
        // Connect stream to video element
        videoReference.current.srcObject = stream;

        // Use promise to handle play success/failure
        await videoReference.current.play();

        // Camera is now active
        setIsActive(true);
        setIsLoading(false);
        retryCountRef.current = 0;
        startingCameraRef.current = false;

        // Start processing frames if callback provided
        if (onFrame) {
          processVideoFrames();
        }

        console.log('Camera started successfully');
      }
    } catch (rawErr) {
      // getUserMedia rejects with a DOMException; name/message are read below.
      const err = rawErr as DOMException;

      // A superseded attempt must not report anything. Its play() was aborted
      // precisely because a newer attempt replaced the stream — that newer one
      // owns the outcome, and the camera is very likely already running.
      if (generation !== cameraGenerationRef.current) {
        startingCameraRef.current = false;
        return;
      }

      // play() rejects with AbortError when a new load request supersedes it.
      // That is the same benign case arriving a beat later; never surface it.
      if (err.name === 'AbortError') {
        console.debug('Camera play() aborted by a newer load request (expected)');
        startingCameraRef.current = false;
        return;
      }

      console.error('Error accessing camera:', err);

      cleanupCamera();
      startingCameraRef.current = false;

      // Enhanced error messages for mobile users
      if (isMobile) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError(
            'Camera permission denied. For mobile browsers, you may need to grant the permission in your browser settings and ensure the site is using HTTPS.',
          );

          toast({
            variant: 'destructive',
            title: 'Camera Permission Denied',
            description:
              'For mobile browsers, you need to grant camera permission in your settings menu',
          });
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError('Cannot access your camera. Try closing other apps that might be using it.');
        } else if (
          err.name === 'OverconstrainedError' ||
          err.name === 'ConstraintNotSatisfiedError'
        ) {
          // For mobile, try with very basic constraints if the first attempt failed
          if (retryCountRef.current === 0) {
            retryCountRef.current += 1;
            setError('Retrying with simpler camera settings...');
            setTimeout(() => {
              startCamera();
            }, 800);
            return;
          } else {
            setError(
              'Your camera does not support the required settings. Try with a different browser.',
            );
          }
        } else {
          setError(`Camera error: ${err.message || 'Unknown mobile browser camera issue'}`);
        }
      } else {
        // Set appropriate error message based on error type for desktop
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Please check your browser settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera detected on this device.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError('Camera is already in use by another application.');
        } else if (
          err.name === 'OverconstrainedError' ||
          err.name === 'ConstraintNotSatisfiedError'
        ) {
          setError('Camera does not support the requested settings. Trying alternative...');
          // Try again with less specific constraints if this was a constraint error
          if (retryCountRef.current === 0) {
            retryCountRef.current += 1;
            setTimeout(() => {
              startCamera();
            }, 500);
            return;
          }
        } else if (err.name === 'AbortError') {
          setError('Camera initialization was interrupted. Please try again.');
          // AbortError can happen when multiple requests occur, so we'll automatically retry once
          if (retryCountRef.current === 0) {
            retryCountRef.current += 1;
            setTimeout(() => {
              startCamera();
            }, 800);
            return;
          }
        } else {
          setError(`Camera error: ${err.message || 'Unknown error'}`);
        }
      }

      setIsLoading(false);

      // Show toast notification for the error
      toast({
        variant: 'destructive',
        title: 'Camera Error',
        description: err.message || 'Failed to access camera',
      });
    }
  }, [facingMode, onFrame, processVideoFrames, cleanupCamera, isMobile]);

  // Initialize camera when component mounts
  useEffect(() => {
    // Start camera immediately for faster startup
    startCamera();

    // Clean up when component unmounts
    return () => {
      cleanupCamera();
    };
  }, []);

  // Handle facing mode changes
  useEffect(() => {
    // If the camera is already active and the facing mode changes, restart the camera
    if (isActive || isLoading) {
      // Add a small delay to ensure previous camera is fully cleaned up
      const timer = setTimeout(() => {
        startCamera();
      }, 500);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [facingMode, startCamera, isActive, isLoading]);

  // Function to retry camera access
  const retryCamera = () => {
    // Prevent rapid retries
    const now = Date.now();
    if (now - lastRetryTime < 1000) {
      console.log('Throttling retry attempts');
      return;
    }

    setLastRetryTime(now);
    retryCountRef.current = 0;
    startCamera();
  };

  return (
    <div className={cn('camera-viewport relative bg-black w-full h-full', className)}>
      <video
        ref={videoReference}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
        playsInline
        muted
        autoPlay
      />

      <canvas
        ref={canvasRef}
        className="hidden" // Hidden canvas for processing
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <Loader2 className="h-10 w-10 text-white animate-spin mb-4" />
          <p className="text-white text-lg font-medium">Accessing camera...</p>
          {isMobile && (
            <p className="text-white/70 text-sm mt-2 text-center px-6">
              Please allow camera access when prompted by your browser
            </p>
          )}
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 p-6"
        >
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-white text-xl font-medium mb-2">Camera Error</h3>
          <p className="text-white/80 text-center mb-6">{error}</p>

          {/* Retrying cannot fix an insecure origin — tell them what actually will. */}
          {!canRetry && !window.isSecureContext && (
            <div className="text-white/70 text-sm mb-6 max-w-sm text-left">
              <p className="font-medium mb-2 text-center">To fix this, use one of:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>
                  Open <code className="text-white">http://localhost:8080</code> on this machine
                </li>
                <li>Serve the app over HTTPS</li>
                <li>
                  Tunnel it:{' '}
                  <code className="text-white">cloudflared tunnel --url http://localhost:8080</code>
                </li>
              </ul>
            </div>
          )}

          {canRetry && isMobile && (
            <div className="text-white/70 text-sm mb-6 max-w-xs text-center">
              <p className="font-medium mb-2">Mobile Troubleshooting:</p>
              <ul className="list-disc text-left pl-6 space-y-1">
                <li>Ensure you've given camera permission</li>
                <li>Try using Chrome or Safari</li>
                <li>Close other apps using your camera</li>
                <li>Reload the page and try again</li>
              </ul>
            </div>
          )}

          {canRetry && (
            <Button onClick={retryCamera} className="bg-white text-black hover:bg-gray-200">
              Retry Camera Access
            </Button>
          )}
        </div>
      )}

      {/* No camera active or error and not loading - show placeholder */}
      {!isActive && !isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-5">
          <Camera className="h-12 w-12 text-white/40 mb-4" />
          <p className="text-white/60 text-center mb-6">Camera inactive</p>
          <Button onClick={retryCamera} className="bg-white text-black hover:bg-gray-200">
            Start Camera
          </Button>
          {isMobile && (
            <p className="text-white/70 text-sm mt-6 max-w-xs text-center">
              For mobile devices, you may need to allow camera permissions when prompted
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default CameraView;
