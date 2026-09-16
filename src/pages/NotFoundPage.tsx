import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { Button } from '../components/ui/Button';
import './NotFoundPage.css';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="container vaango-not-found">
      <div className="vaango-not-found__icon-box" aria-hidden="true">
        <Compass size={56} />
      </div>
      <h1 className="vaango-not-found__code">404</h1>
      <h2 className="vaango-not-found__title">Page Not Found</h2>
      <p className="vaango-not-found__desc">
        The destination you are looking for does not exist or has been relocated within the local directory.
      </p>
      <Link to="/">
        <Button variant="primary" size="lg" leftIcon={<Home size={18} />}>
          Return to Home
        </Button>
      </Link>
    </div>
  );
};
