const devCredentials = require('./secrets/devCredentials');
const NodeMediaServer = require('./');
const fetch = require("node-fetch");
const os = require("os");
const MediaRoot = process.env.MEDIA_ROOT || './media'
const AUTHSECRET = process.env.AUTH_SECRET || 'nodemedia2017privatekey'
const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8080,
    mediaroot: MediaRoot,
    webroot: './www',
    allow_origin: '*',
    api: true
  },
  https: {
    port: 8443,
    key: './privatekey.pem',
    cert: './certificate.pem',
  },
  trans: {
    ffmpeg: '/usr/local/bin/ffmpeg',
    tasks: [
      {
        app: 'livetuter',
        mp4: true,
        mp4Flags: '[movflags=frag_keyframe+empty_moov]',
      }
    ]
  },
  auth: {
    api: true,
    api_user: 'admin',
    api_pass: 'admin',
    play: false,
    publish: false,
    secret: AUTHSECRET
  },
};
let nms;

//login to API Service

fetch('http://localhost:3001/v1/user/login', {
  method: 'POST',
  body: JSON.stringify({
    email: devCredentials["email"],
    password: devCredentials["password"]
  }),
  headers: {
    'Content-Type': 'application/json'
  }
}).then(function (response) {
response.json().then(function (data) {
  console.log(data)
  console.log(os.hostname())
  let token = data.token
  config.token = token
  nms = new NodeMediaServer(config)
  nms.run();
  //nms.stop()

  nms.on('preConnect', (id, args) => {
    console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
    // let session = nms.getSession(id);
    // session.reject();
  });

  nms.on('postConnect', (id, args) => {
    console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
  });

  nms.on('doneConnect', (id, args) => {
    console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
  });

  nms.on('prePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    // let session = nms.getSession(id);
    // session.reject();
  });
//https://msdevopsdude.com/2020/07/07/Setting-up-a-custom-RTMP-endpoint-for-capturing-live-video-stream/
  nms.on('postPublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    //send server url to stream document
    //get streamKey
    //find document based on streamKey
    //update user document to show isLive=true
    //update stream document with current stream url
    let streamKey = StreamPath.split('/')[2]
//url = "http://localhost:8080/livetuter/" + this.props.tuterConfig.streamConfig.streamKey + ".flv"
    fetch('http://localhost:3001/v1/stream/updateStreamStatus', {
      method: 'POST',
      body: JSON.stringify({
        "streamKey": streamKey,
        "streamServer": 'http://localhost:8080',
        "isLive": true,
        "currentSessionId": id,
        "connectionStart": Date.now()
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    }).then(function (response) {
      console.log(response)
    }).catch(function (error) {
      console.log(error)
    })

    // fetch('http://localhost:3001/v1/stream/updateStreamServer', {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     "streamKey": streamKey,
    //     "streamServer": 'https://' + os.hostname() + '/api.tuter.io',
    //     "isLive": true
    //   }),
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': 'Bearer ' + token
    //   }
    // }).then(function (response) {
    //   console.log(response)
    //
    // }).catch(function (error) {
    //   console.log(error)
    // })
  });

  nms.on('donePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

    let streamKey = StreamPath.split('/')[2]
    fetch('http://localhost:3001/v1/stream/updateStreamStatus', {
      method: 'POST',
      body: JSON.stringify({
        "streamKey": streamKey,
        "streamServer": 'http://localhost:8080',//ROMO TODO: os.hostname()
        "isLive": false,
        "connectionTerminated": Date.now()
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    }).then(function (response) {
      console.log(response)
      //ROMO TODO: Start Transmuxing
    }).catch(function (error) {
      console.log(error)
    })

    // //find document based on streamKey
    // //update user document to show isLive=false
    // //update stream document with nil
    // fetch('http://localhost:3001/v1/stream/updateStreamServer', {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     "streamKey": streamKey,
    //     "streamServer": os.hostname(),
    //     "isLive": false
    //   }),
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': 'Bearer ' + token
    //   }
    // }).then(function (response) {
    //   console.log(response)
    // }).catch(function (error) {
    //   console.log(error)
    // }) `
  });

  nms.on('prePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    // let session = nms.getSession(id);
    // session.reject();
  });

  nms.on('postPlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  });

  nms.on('donePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  });

})
}).catch(function (error) {
console.log(error)
  process.exit()
})


