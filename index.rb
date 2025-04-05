require 'sinatra'
require 'json'
require 'jwt'
require 'open3'

# Constants
CACHE_DURATION_MS = 5 * 60 * 1000 # 5 minutes
JWT_SECRET_KEY = 'SECRET_TOKEN'

# In-memory configuration cache to store application metadata and git SHA.
$config_cache = {
  metadata: nil,
  sha: nil,
  last_updated: 0
}

# Utility function to retrieve the latest git commit SHA.
# @returns [String] Git SHA hash
def get_git_sha
  stdout, stderr, status = Open3.capture3('git rev-parse HEAD')
  raise stderr unless status.success?
  stdout.strip
end

# Utility function to handle error responses in the API.
# @param [Sinatra::Response] res - Sinatra response object
# @param [Integer] status_code - HTTP status code
# @param [String] message - Error message
def handle_error_response(res, status_code, message)
  puts message
  res.status(status_code)
  res.json(error: message)
end

# Asynchronously loads application configuration with intelligent caching.
def load_configuration
  current_timestamp = Time.now.to_i * 1000

  if $config_cache[:metadata] && (current_timestamp - $config_cache[:last_updated]) < CACHE_DURATION_MS
    return $config_cache
  end

  begin
    # Load metadata
    metadata_content = File.read('./metadata.json')
    metadata = JSON.parse(metadata_content)

    # Get Git SHA
    sha = get_git_sha

    # Update cache
    $config_cache[:metadata] = metadata
    $config_cache[:sha] = sha
    $config_cache[:last_updated] = current_timestamp

    $config_cache
  rescue => e
    puts "Configuration loading failed: #{e}"
    raise 'Failed to load configuration'
  end
end

# Middleware to authenticate requests using JSON Web Token (JWT).
before do
  if request.path_info != '/' && request.path_info != '/status'
    auth_header = request.env['HTTP_AUTHORIZATION']
    token = auth_header&.split(' ')&.last

    if token.nil?
      halt 401, { error: 'Unauthorized: Missing token' }.to_json
    end

    begin
      decoded_token = JWT.decode(token, JWT_SECRET_KEY, true, { algorithm: 'HS256' })
      env['user'] = decoded_token.first
    rescue JWT::DecodeError
      halt 403, { error: 'Forbidden: Invalid token' }.to_json
    end
  end
end

# Root endpoint returning a simple greeting.
get '/' do
  content_type :json
  { message: 'Hello World' }.to_json
end

# Status endpoint providing application metadata and build information.
get '/status' do
  content_type :json

  begin
    config = load_configuration
    metadata = config[:metadata]
    sha = config[:sha]
    build_number = ENV['BUILD_NUMBER'] || '0'

    {
      'my-application' => [
        {
          description: metadata['description'],
          version: "#{metadata['version']}-#{build_number}",
          sha: sha
        }
      ]
    }.to_json
  rescue => e
    handle_error_response(response, 500, 'Internal Server Error')
  end
end

# Start the server.
set :port, ENV['PORT'] || 3000
puts "Server is running on port #{settings.port}"