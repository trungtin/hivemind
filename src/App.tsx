import React, { useState } from 'react'
import logo from './logo.svg'
import './App.css'
import { Editor } from './Editor'

function App() {
  const [c, sc] = useState(0)
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload 3 {c}.
        </p>
        <button onClick={() => sc(c + 1)}>Increase</button>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
      <Editor></Editor>
    </div>
  )
}

export default App
