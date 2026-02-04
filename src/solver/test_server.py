from server import app, test_remote


@app.local_entrypoint()
def test_server():
    print(test_remote.remote())
