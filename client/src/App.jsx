import { Route, Routes } from 'react-router-dom';
import { GuestRoute, ProtectedRoute } from './components/RouteGuards.jsx';
import MockModeBadge from './components/MockModeBadge.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Chat from './pages/Chat.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

// The socket lives in AuthContext, so you stay online on every logged-in page, including /profile.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:conversationId" element={<Chat />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <MockModeBadge />
    </>
  );
}
