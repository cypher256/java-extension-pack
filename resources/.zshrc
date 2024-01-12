if [ -f ~/.zshrc ]; then
	source ~/.zshrc
fi
export JAVA_HOME=$AUTOCONFIG_JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
