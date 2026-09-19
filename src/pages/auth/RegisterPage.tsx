import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export const RegisterPage: React.FC = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  searchParams.set('mode', 'signup');

  return <Navigate to={`/login?${searchParams.toString()}`} state={location.state} replace />;
};
