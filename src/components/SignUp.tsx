import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";
import GOOGL from "../assets/google_logo.png";
import { supabase } from "../context/supabaseClient";

const SignUp = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showVerifyPopup, setShowVerifyPopup] = useState(false);
  const navigate = useNavigate();
  const [usingGoogle, setUsingGoogle] = useState(false);

  const { session, signUpNewUser } = UserAuth() || {};

  if (session) {
    return <Navigate to="/watchlist" />;
  }

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (usingGoogle) {
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/watchlist`,
          },
        });
      }
      const result = await signUpNewUser(email, password);
      if (result.success) {
        setShowVerifyPopup(true);
      } else if (!usingGoogle) {
        setError(result.error.message || "Sign up failed");
      }
    } catch (err) {
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Email verification popup */}
      {showVerifyPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="relative bg-black rounded-lg shadow-lg p-8 max-w-sm w-full">
            <button
              className="absolute top-2 right-5 text-gray-400 hover:text-gray-600 text-xl"
              onClick={() => setShowVerifyPopup(false)}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-lg font-semibold mb-2">Verify your email</h3>
            <p className="text-gray-700 mb-2">
              We've sent a verification link to your email address. Please check
              your inbox and follow the instructions to verify your account.
            </p>
            <p className="text-xs text-gray-400">You may close this message.</p>
          </div>
        </div>
      )}
      <form onSubmit={handleSignUp} className="max-w-md m-auto pt-24">
        <h2 className="font-bold pb-2">Sign Up</h2>
        <p>
          Already have an account? <Link to="/signin">Sign In!</Link>
        </p>

        <div className="flex flex-col py-4">
          <input
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="p-3 mt-6"
            type="email"
          />
          <input
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="p-3 mt-6"
            type="password"
          />
          <button
            type="submit"
            disabled={loading}
            className="p-3 mt-6 w-full disabled:opacity-50 bg-gray-700 hover:bg-gray-500 "
          >
            Sign Up
          </button>
          <div className="mt-6 flex items-center gap-3 text-gray-400">
            <span className="flex-1 h-px bg-gray-600" />
            <span className="text-sm">Other sign up options</span>
            <span className="flex-1 h-px bg-gray-600" />
          </div>
          <button
            className="h-12 w-12 bg-white flex items-center justify-center self-center mt-4"
            onClick={() => setUsingGoogle(true)}
          >
            <img src={GOOGL} alt="Google Logo" className="h-8 w-8" />
          </button>
          {error && <p className="text-red-600 p-6">{error}</p>}
        </div>
      </form>
    </div>
  );
};

export default SignUp;
