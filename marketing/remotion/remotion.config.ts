import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(1);
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p'); // limited-range 4:2:0 for broad player compatibility (default gave yuvj420p)
Config.setAudioBitrate('256k');
