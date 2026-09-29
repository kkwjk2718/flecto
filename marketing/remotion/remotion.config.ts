import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(1);
Config.setCodec('h264');
Config.setCrf(18);
Config.setAudioBitrate('256k');
