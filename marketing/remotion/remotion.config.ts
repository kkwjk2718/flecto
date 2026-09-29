import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(1);
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
// Without an explicit color space, JPEG frames were tagged yuvj420p (full range). bt709 gives tv range + bt709 tags.
Config.setColorSpace('bt709');
Config.setAudioBitrate('256k');
