pip install pyre-extensions==0.0.23
pip install numpy
git clone https://github.com/facebookresearch/xformers/
cd xformers
git submodule update --init --recursive
pip install --verbose --no-deps -e .
cd ~
cd stable-diffusion-webui/
python launch.py --disable-safe-unpickle --port=6006 --xformers --share