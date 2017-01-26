'use strict'

const net = require('net')

function Server(serverPort, funcs) {
  this.server = net.createServer(function (socket) {
    socket.name = socket.remoteAddress + ":" + socket.remotePort
    socket.session = {}

    let header = Buffer.alloc(5)
    var hasConnection = true
    function sendToClient(data, id) {
      if (hasConnection && (typeof(data) !== "undefined")) {
        var fdata
        if (typeof(id) !== "undefined") {
          let ob = {}
          ob[id] = data
          fdata = ob
        } else {
          fdata = data
        }

        if (fdata) {
          let txtMsg = JSON.stringify(fdata)
          let bfLen = Buffer.byteLength(txtMsg)
          header.writeUInt8(1, 0)
          header.writeUInt32LE(bfLen, 1)
          socket.write(
            Buffer.concat([
              header,
              Buffer.from(txtMsg)
            ]))
        }

        return true
      } else {
        return false
      }
    }

    socket.on('data', function (data) {
      while (data.length >= 5) {
        let ob
        let msgType = data.readUInt8(0)
        let msgLen = data.readUInt32LE(1)
        data = data.slice(5)
        try {
          ob = JSON.parse(data.slice(0, msgLen).toString('utf8'))
        } catch (e) {
          data = data.slice(msgLen)
          continue
        }

        parseOb(ob)
        data = data.slice(msgLen)
      }

      function parseOb(ob) {
        for (let x in ob) {
          if (x in funcs) {
            let payl = ob[x].payload
            let result
            let stcWrap = (iid => iob => {
              if (socket.destroyed) {
                return false
              } else {
                return sendToClient(iob, iid)
              }
            })(ob[x].id)
            try {
              result = funcs[x](socket.session, stcWrap, ...payl)
            } catch (e) {
              result = {
                __error__: {
                  message: e.message || e,
                  name: e.name || '',
                  stack: e.stack || ''
                }
              }
            }
            sendToClient(result, ob[x].id)
          }
        }
      }
    })

    socket.on('close', function (had_error) {
      hasConnection = false
    })

    socket.on('error', function(err) {
      console.log(err)
    })

    let methods = []
    for (let x in funcs) {
      methods.push(x)
    }

    sendToClient({_builtin_methods_: methods})
  })

  this.server.listen(serverPort)
}

function Client(host, port) {
  let connOps = { host, port }
  this.socket = net.createConnection(connOps, () => {})

  let self = this
  let sendQueue = []
  let waitingResponse = false
  function enqueueMsg(msg) {
    sendQueue.push(msg)

    tryPushQueue()
  }

  let header = Buffer.alloc(5)
  function tryPushQueue() {
    if (!waitingResponse) {
      let mob = sendQueue.splice(0, 1)
      if (mob.length == 1) {
        let txtMsg = JSON.stringify(mob[0])
        let bfLen = Buffer.byteLength(txtMsg)
        header.writeUInt8(1, 0)
        header.writeUInt32LE(bfLen, 1)
        self.socket.write(
          Buffer.concat([
            header,
            Buffer.from(txtMsg)
          ]), function() {
          waitingResponse = false
          tryPushQueue()
        })
      }
    }
  }

  this.nextCallId = 1
  var onReady
  this.funcs = {}
  this.callbacks = {
    _builtin_methods_: function(methods) {
      for (let i=0; i < methods.length; i++) {
        let fn = (function(name, client) {
          return function(...args) {
            let cb

            if (typeof(args[args.length-1]) === "function") {
              cb = args.pop()
            }

            let ob = {}
            let cid = client.nextCallId++
            ob[name] = {payload: args, id: cid}

            if (typeof(cb) !== "undefined") {
              client.callbacks[cid] = function(ob) {
                if (cb) {
                  let err
                  if (ob.__error__) {
                    err = ob.__error__
                    delete ob.__error__
                  }
                  if (!cb(err, ob)) {
                    delete client.callbacks[cid]
                  }
                } else {
                  delete client.callbacks[cid]
                }
              }
            }

            enqueueMsg(ob)

            return this
          }
        })(methods[i], this)

        this.funcs[methods[i]] = fn
      }

      if (onReady) {
        onReady()
      }
    }
  }

  this.on = function(name, method) {
    this.callbacks[name] = method
  }

  this.socket.on('data', (data) => {
    while (data.length >= 5) {
      let ob
      let msgType = data.readUInt8(0)
      let msgLen = data.readUInt32LE(1)
      data = data.slice(5)
      try {
        ob = JSON.parse(data.slice(0, msgLen).toString('utf8'))
      } catch (e) {
        data = data.slice(msgLen)
        continue
      }

      data = data.slice(msgLen)

      for (let x in ob) {
        if (x in this.callbacks) {
          this.callbacks[x].call(this, ob[x])
        }
      }
    }
  })

  let intervalHandler
  this.socket.on('connect', () => {
    if (intervalHandler) {
      clearInterval(intervalHandler)
    }
  })

  this.socket.on('end', () => {
    let self = this
    intervalHandler = setInterval(function () {
      self.socket.connect(connOps)
    }, 5000);
  })

  this.socket.on('error', (err) => { console.log(err) })

  this.ready = function(cb) {
    onReady = cb
  }
}

module.exports = {
  Server,
  Client
}
