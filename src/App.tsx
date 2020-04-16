import React, { useState } from 'react'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import Page from './Page'
import { initPage } from './services/page'

function App() {
  const navigate = useNavigate()
  return (
    <div className="App">
      <nav>
        <button
          onClick={async () => {
            const page = await initPage()
            navigate(`/page/${page.id}`)
          }}
        >
          New Page
        </button>
      </nav>
      {/* <Page></Page> */}
      <Routes>
        <Route path="page">
          {/* <Route path="" element={<Page />} /> */}
          <Route path=":pageId" element={<Page />} />
        </Route>
      </Routes>
    </div>
  )
}

export default App
