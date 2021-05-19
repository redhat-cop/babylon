import {
  combineReducers,
  configureStore,
} from '@reduxjs/toolkit';

import { authReducer } from './authSlice';

export const store = configureStore({
  reducer: combineReducers({
    auth: authReducer,
  }),
});
