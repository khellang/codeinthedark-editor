const fs = require('fs');
const http = require('http');
const cors = require('cors');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use('/assets', express.static(path.join(__dirname, 'app/assets')))
app.use('/monitor/assets', express.static(path.join(__dirname, 'assets')))
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(cors());

const router = express.Router();

const users = {};

function fixedEncodeURIComponent(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16);
  });
}

function frameContent (documentSrc, username) {
  const encodedSrc = fixedEncodeURIComponent(documentSrc);
  const usernames = Object.keys(users);
  const index = usernames.indexOf(username);
  const nextIndex = (index + 1) % usernames.length;
  const nextUsername = usernames[nextIndex];
  const containerMarkup = `
  <html>
    <head>
      <style>
        @font-face {
          font-family: "Press Start 2P";
          src: url(/monitor/assets/fonts/PressStart2P-Regular.ttf) format("truetype");
        }
      
        * {
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: "Press Start 2P", sans-serif;
          height: 100vh;
          background-color: black;
          color: white;
          display: flex;
          flex-direction: column;
          background: black;
          margin: 30px;
        }
        
        .name-tag {
          position: absolute;
          z-index: 40;
          bottom: 20px;
          left: 20px;
          padding: 20px;
          background: rgba(58,147,100,.75);
          color: white;
          font-size: 56px;
        }
        
        iframe {
          border-style: none;
          background-color: white;
          flex: 1;
        }
      </style>
    </head>
    
    <body>
      <span class="name-tag">${username}</span>
      <script src="/socket.io/socket.io.js"></script>
      <script>
        var iframe = document.createElement('iframe');
        var html = '';
        iframe.setAttribute('sandbox', 'allow-same-origin');
        document.body.appendChild(iframe);
        iframe.contentWindow.document.open();
        iframe.contentWindow.document.write(decodeURIComponent('${encodedSrc}'));
        iframe.contentWindow.document.close();

        var socket = io('/${username}');
        socket.on('newmarkup', function (markupEvent) {
          iframe.contentWindow.document.open();
          iframe.contentWindow.document.write(markupEvent.markup);
          iframe.contentWindow.document.close();
        });

        setTimeout(() => location.assign('/monitor/${nextUsername}'), 30000);
      </script>    
    </body>
  </html>
  `;
    
  return containerMarkup;
}

router.route('/')
  .get((req, res) => {
    res.sendFile(path.join(__dirname, 'app/editor.html'))
  })

router.route('/monitor')

  .get((req, res) => {
    let markup = `
    <html>
      <head>
        <script src="/socket.io/socket.io.js"></script>
        <style>
          @font-face {
            font-family: "Press Start 2P";
            src: url(/monitor/assets/fonts/PressStart2P-Regular.ttf) format("truetype");
          }
        
          * {
            margin: 0;
            padding: 0;
          }

          body {
            font-family: "Press Start 2P", sans-serif;
            height: 100vh;
            background-color: black;
            color: white;
            display: flex;
            flex-direction: column;
            background: black;
            margin: 30px;
            align-items: center;
          }

          a {
            color: inherit;
            text-decoration: none;
            line-height: 2.5em;
            display: block;
          }

          ul {
            list-style: none;
            width: 50%;
            text-align: center;
            z-index: 10;
          }

          li {
            background: rgb(58,147,100);
            color: white;
            font-size: 56px;
            margin: 10px;
          }
        </style>
      </head>
      <body>
        <ul id="users">
    `;
    Object.keys(users).forEach((userName) => {
      markup += `<li><a href='/monitor/${userName}'>${userName}</a></li>`;
    });
    markup += `
        </ul>
      </body>
      <script>
      var socket = io('/');
      var element = document.getElementById('users');
      socket.on('newuser', function (userEvent) {
        var a = document.createElement('a');
        const username = userEvent.username;
        var text = document.createTextNode(username);
        a.appendChild(text);
        a.href = '/monitor/' + username;
        var li = document.createElement('li');
        li.appendChild(a);
        element.appendChild(li);
      });
      </script>
    </html>
    `;
    res.send(markup);
  })
;

router.route('/monitor/:username')
  .get((req, res) => {
    const markup = users[req.params.username] !== undefined ?
      users[req.params.username] :
      '<body style="display: flex;justify-content: center;align-items: center;font-family: sans-serif;"><h1>Waiting for contestant...</h1></body>';
    io.of(`/${req.params.username}`); // Force socket.io to initialize the namespace

    res.send(frameContent(markup, req.params.username));
  })

  .post((req, res) => {
    if (users[req.params.username] === undefined) {
      io.of('/').emit('newuser', {username: req.params.username});
    }
    users[req.params.username] = req.body.markup;
    io.of(`/${req.params.username}`).emit('newmarkup', {markup: req.body.markup});
    res.send();
  })
;

app.use('/', router);

let port = 1337;
if (process.argv.length > 2) {
  port = Number(process.argv[2]);
}

const httpServer = http.createServer(app);
const io = require('socket.io')(httpServer);

httpServer.listen(port);

console.log('Listening on port ' + port);
