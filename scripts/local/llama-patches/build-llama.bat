@echo off
rem usage: build-llama.bat <source dir> <build dir>
setlocal
set SRC=%~1
set OUT=%~2
set ENVROOT=C:\dev\tools\cuda128-env
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
set CUDA_PATH=%ENVROOT%\Library
set PATH=%ENVROOT%\Library\bin;%ENVROOT%\Scripts;%PATH%
cmake -S "%SRC%" -B "%OUT%" -G Ninja -DCMAKE_BUILD_TYPE=Release ^
  -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86 -DGGML_NATIVE=ON ^
  -DGGML_CUDA_CCCL_VERSION=v3.4.3 ^
  -DCUDAToolkit_ROOT="%ENVROOT%\Library" -DCMAKE_CUDA_COMPILER="%ENVROOT%\Library\bin\nvcc.exe" ^
  -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_OPENSSL=OFF || exit /b 1
cmake --build "%OUT%" --config Release -j 6 --target llama-server || exit /b 1
endlocal
