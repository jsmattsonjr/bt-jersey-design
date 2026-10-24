# Sourced by the zsh scripts: sets $py to a Python with Pillow and psd-tools.
# $PYTHON if set, else the repo's .venv (a venv, or a symlink to one), else python3.
py=${PYTHON:-${0:A:h}/.venv/bin/python}
[[ $PYTHON || -x $py ]] || py=python3
