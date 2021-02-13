//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const fs = require('fs');
const FormData = require('form-data');
const fetch = require("node-fetch");

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
  }

  run() {
    let vc = this.conf.vc || 'copy';
    let ac = this.conf.ac || 'copy';
    let inPath = 'rtmp://127.0.0.1:' + this.conf.rtmpPort + this.conf.streamPath;
    let ouPath = `${this.conf.mediaroot}/${this.conf.streamApp}/${this.conf.streamName}`;
    let mapStr = '';

    if (this.conf.rtmp && this.conf.rtmpApp) {
      if (this.conf.rtmpApp === this.conf.streamApp) {
        Logger.error('[Transmuxing RTMP] Cannot output to the same app.');
      } else {
        let rtmpOutput = `rtmp://127.0.0.1:${this.conf.rtmpPort}/${this.conf.rtmpApp}/${this.conf.streamName}`;
        mapStr += `[f=flv]${rtmpOutput}|`;
        Logger.log('[Transmuxing RTMP] ' + this.conf.streamPath + ' to ' + rtmpOutput);
      }
    }
    if (this.conf.mp4) {
      this.conf.mp4Flags = this.conf.mp4Flags ? this.conf.mp4Flags : '';
      let mp4FileName = dateFormat('yyyy-mm-dd-HH-MM') + '.mp4';
      let mapMp4 = `${this.conf.mp4Flags}${ouPath}/${mp4FileName}|`;
      mapStr += mapMp4;
      Logger.log('[Transmuxing MP4] ' + this.conf.streamPath + ' to ' + ouPath + '/' + mp4FileName);
    }
    if (this.conf.hls) {
      this.conf.hlsFlags = this.conf.hlsFlags ? this.conf.hlsFlags : '';
      let hlsFileName = 'index.m3u8';
      let mapHls = `${this.conf.hlsFlags}${ouPath}/${hlsFileName}|`;
      mapStr += mapHls;
      Logger.log('[Transmuxing HLS] ' + this.conf.streamPath + ' to ' + ouPath + '/' + hlsFileName);
    }
    if (this.conf.dash) {
      this.conf.dashFlags = this.conf.dashFlags ? this.conf.dashFlags : '';
      let dashFileName = 'index.mpd';
      let mapDash = `${this.conf.dashFlags}${ouPath}/${dashFileName}`;
      mapStr += mapDash;
      Logger.log('[Transmuxing DASH] ' + this.conf.streamPath + ' to ' + ouPath + '/' + dashFileName);
    }
    mkdirp.sync(ouPath);
    let argv = ['-y', '-fflags', 'nobuffer', '-i', inPath];
    Array.prototype.push.apply(argv, ['-c:v', vc]);
    Array.prototype.push.apply(argv, this.conf.vcParam);
    Array.prototype.push.apply(argv, ['-c:a', ac]);
    Array.prototype.push.apply(argv, this.conf.acParam);
    Array.prototype.push.apply(argv, ['-f', 'tee', '-map', '0:a?', '-map', '0:v?', mapStr]);
    argv = argv.filter((n) => { return n }); //去空
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });
    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Transmuxing end] ' + this.conf.streamPath);
      this.emit('end');
      let token = this.conf.token
      let didRun = false
      fs.readdir(ouPath, function (err, files) {
        if(didRun) {
          return
        }
        if (!err && files[files.length - 1]) {
          let streamKey = ouPath.split('/').slice(-1)[0]
          let archiveDate = files[files.length - 1].split(".")[0]

          fetch('http://localhost:3001/v1/course-content/getStreamData', {
            method: 'POST',
            body: JSON.stringify({
              streamKey: streamKey
            }),
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            }
          }).then(function (response) {
            response.json().then(function (responseData) {
              if(responseData['errorMessage']) {
                console.log('Stream is not active')
                fs.unlinkSync(ouPath + '/' + files[files.length - 1])
                return
              }
              const data = new FormData();
              //ROMO TODO: Trim video from start to end
              data.append("upload", fs.createReadStream(ouPath + "/" + files[files.length - 1]));
              data.append("streamKey", streamKey)
              data.append("command", 'TRIM')
              data.append("fromSeconds", responseData.startTrim)

              //ROMO TODO: unlinkSync
              fs.unlinkSync(ouPath + '/' + files[files.length - 1])

              fetch('http://localhost:3002/v1/media/command', {
                method: 'POST',
                body: data,
                headers: {
                  'Authorization': 'Bearer ' + token
                }
              }).then(function (response) {
                response.json().then(function (data) {
                  console.log(data)

                  let cutVideoUrl = data.cutVideoUrl
                  let previewImages = data.previewImages
                  let previewVideoUrl = data.previewVideoUrl

                  fetch('http://localhost:3001/v1/course-content/createVideoArchive', {
                    method: 'POST',
                    body: JSON.stringify({
                      videoURL: cutVideoUrl,
                      previewURL: previewVideoUrl,
                      thumbnails: previewImages,
                      streamKey: streamKey,
                      streamArchiveDate: archiveDate
                    }),
                    headers: {
                      'Authorization': 'Bearer ' + token,
                      'Content-Type': 'application/json'
                    }
                  }).then(function (response) {
                    response.json().then(function (data){
                      console.log(data)
                    })
                  }).catch(function (error) {
                    console.log(error)
                  })

                })
              }).catch(function (error) {
                console.log(error)
              })
            })
          })
        }
        if(didRun == false) {
          didRun = true
        }

      });
    });
  }

  end() {
    // this.ffmpeg_exec.kill();
  }

  startTransmuxing() {
    let ouPath = `${this.conf.mediaroot}/${this.conf.streamApp}/${this.conf.streamName}`;
    Logger.log('[Transmuxing end] ' + this.conf.streamPath);
    this.emit('end');
    let token = this.conf.token
    fs.readdir(ouPath, function (err, files) {
      if (!err && files[0]) {
        let streamKey = ouPath.split('/').slice(-1)[0]
        let archiveDate = files[0].split(".")[0]
        const data = new FormData();
        //ROMO TODO: Trim video from start to end
        data.append("upload", fs.createReadStream(ouPath + "/" + files[0]));
        data.append("streamKey", streamKey)

        fs.unlink(ouPath + '/' + files[0], (err) => {
          if (err) throw err;
          console.log('successfully deleted ' + ouPath + '/' + files[0]);
        });

        fetch('http://localhost:3001/v1/course-content/uploadStreamArchive', {
          method: 'POST',
          body: data,
          headers: {
            'Authorization': 'Bearer ' + token
          }
        }).then(function (response) {
          response.json().then(function (data) {
            console.log(data)
            let videoURL = data.url
            if(response.status == 200) {
              fetch('http://localhost:3001/v1/course-content/createVideoArchive', {
                method: 'POST',
                body: JSON.stringify({
                  videoURL: videoURL,
                  streamKey: streamKey,
                  streamArchiveDate: archiveDate
                }),
                headers: {
                  'Authorization': 'Bearer ' + token,
                  'Content-Type': 'application/json'
                }
              }).then(function (response) {
                response.json().then(function (data) {
                  console.log(response)
                  if(response.status != 200) {
                    console.log("Video archive process failed: " + data.errorMessage)
                  } else {
                    console.log("Video archive process success")
                  }
                  fs.unlink(ouPath + '/' + files[0], (err) => {
                    if (err) throw err;
                    console.log('successfully deleted ' + ouPath + '/' + files[0]);
                  });
                }).catch(function (error) {
                  console.log(error)
                  fs.unlink(ouPath + '/' + files[0], (err) => {
                    if (err) throw err;
                    console.log('successfully deleted ' + ouPath + '/' + files[0]);
                  });
                })
              }).catch(function (error) {
                console.log(error)
                fs.unlink(ouPath + '/' + files[0], (err) => {
                  if (err) throw err;
                  console.log('successfully deleted ' + ouPath + '/' + files[0]);
                });
              })
            }
          })
        }).catch(function (error) {
          console.log(error)
        })

        if (filename.endsWith('.ts')
            || filename.endsWith('.m3u8')
            || filename.endsWith('.mpd')
            || filename.endsWith('.m4s')
            || filename.endsWith('.tmp')) {
          fs.unlinkSync(ouPath + '/' + filename);
        }
      }

    });
  }
}

module.exports = NodeTransSession;
