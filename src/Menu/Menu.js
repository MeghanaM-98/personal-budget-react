import React from 'react';
import { 
  Link 
} from 'react-router-dom';

function Menu() {
  return (
    <nav className="menu" role="navigation" aria-label="Main navigation">
        <ul>
            <li><Link to="/" aria-label="Go to Homepage" aria-current="page">Home</Link></li>
            <li><Link to="/about" aria-label="Learn About the App">About</Link></li>
            <li><Link to="/login" aria-label="Log in to your account">Login</Link></li>
        </ul>
    </nav>
  );
}

export default Menu;