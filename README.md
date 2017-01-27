# jsonsock
An idiomatic ES6 NON-jsonrpc-compliant json RPC library for NodeJS.

## Example usage

### Server Example

```javascript
    const jsonsock = require('jsonsock')
    const rpcPort = 9001

    var state = 0
    var notifyFunc

    var server = new jsonsock.Server(rpcPort, {
      getState: () => state,
      addState: (session, send, amount) => {
        state += amount

        if (notifyFunc) {
          notifyFunc()
        }

        return state
      },
      watchState: (session, send) => {
        notifyFunc = () => { send(state) }
      },
      setSessionAmount: (session, send, amount) => {
        session.amount = amount
      },
      getSessionAmount: (session) => session.amount
    })
```

### Client Example

```javascript
    const jsonsock = require('jsonsock')
    const remoteRpcPort = 9001
    const remoteRpcHost = '127.0.0.1'

    var client = new jsonsock.Client(remoteRpcHost, remoteRpcPort)
    client.ready(() => {
      let remote = client.funcs

      remote.getState((err, data) => { console.log(data) }) // Prints 0
      remote.addState(5, (err, data) => { console.log(data) }) // Prints 5
      remote.watchState((err, data) => console.log(data)) // Does nothing until next line
      remote.addState(5, (err, data) => { }) // Prints 10, because the watcher above gets called
      remote.setSessionAmount(15, () => { }) // Does nothing
      remote.getSessionAmount((err, data) => { console.log(data) }) // Prints 15
    })
```

## License

MIT Licensed
